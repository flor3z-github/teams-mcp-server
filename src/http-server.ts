import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { Config } from "./config.js";
import { createTeamsServer } from "./mcp-server.js";
import { sessionStore, type SessionCredentials } from "./context.js";
import {
  TeamsOAuthProvider,
  startDeviceFlow,
  pollDeviceFlow,
} from "./auth/provider.js";

export interface HttpServerHandle {
  stop(): void;
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/**
 * TLS cert/key를 읽는다. 둘 다 설정된 경우에만 HTTPS로 동작한다.
 * 파일 읽기 실패는 복구 불가능하므로 즉시 종료한다.
 */
function loadTlsOptions(config: Config): { cert: Buffer; key: Buffer } | null {
  if (!config.tlsCert || !config.tlsKey) return null;
  try {
    return {
      cert: readFileSync(config.tlsCert),
      key: readFileSync(config.tlsKey),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`teams mcp: failed to read TLS cert/key: ${message}\n`);
    process.exit(1);
  }
}

export function startHttpServer(config: Config): HttpServerHandle {
  const tlsOptions = loadTlsOptions(config);
  const scheme = tlsOptions ? "https" : "http";

  const provider = new TeamsOAuthProvider(config.port);

  // 루프백/와일드카드 바인딩은 issuer 호스트명을 localhost로 고정한다.
  // (기존 클라이언트 설정 호환 + MCP SDK의 issuer 검증 통과)
  const issuerHost =
    config.host === "0.0.0.0" || config.host === "::" || isLoopback(config.host)
      ? "localhost"
      : config.host;

  const issuerUrl = config.baseUrl
    ? new URL(config.baseUrl)
    : new URL(`${scheme}://${issuerHost}:${config.port}`);

  if (
    !tlsOptions &&
    !isLoopback(config.host) &&
    !config.baseUrl?.startsWith("https:")
  ) {
    process.stderr.write(
      "teams mcp: WARNING: listening on a non-loopback address without TLS. " +
        "Bearer tokens and OAuth authorization codes are sent in cleartext. " +
        "Set TEAMS_TLS_CERT/TEAMS_TLS_KEY, or terminate TLS at a reverse proxy.\n",
    );
  }

  const app = express();

  // 리버스 프록시 뒤에서만 X-Forwarded-* 를 신뢰한다 (TEAMS_BASE_URL이 프록시 신호)
  if (config.baseUrl) {
    app.set("trust proxy", 1);
  }

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  // OAuth endpoints (/.well-known/*, /authorize, /token, /register, /revoke)
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
    }),
  );

  // Device code flow endpoints
  app.post("/oauth/device-start", (_req, res) => {
    const { flowId } = startDeviceFlow();
    res.json({ flowId });
  });

  app.get("/oauth/device-poll", (req, res) => {
    const flowId = req.query.flow_id as string | undefined;
    if (!flowId) {
      res.status(400).json({ error: "Missing flow_id" });
      return;
    }
    const result = pollDeviceFlow(flowId);
    if (!result) {
      res.status(404).json({ error: "Flow not found" });
      return;
    }
    res.json(result);
  });

  app.post("/oauth/device-callback", (req, res) => {
    const { authSessionToken, flowId } = req.body as {
      authSessionToken?: string;
      flowId?: string;
    };

    if (!authSessionToken || !flowId) {
      res.status(400).json({ error: "Missing authSessionToken or flowId" });
      return;
    }

    const result = provider.handleDeviceCallback(authSessionToken, flowId);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ redirectUrl: result.redirectUrl });
  });

  // Bearer auth middleware for MCP endpoints
  const bearerAuth = requireBearerAuth({ verifier: provider });

  const transports = new Map<string, StreamableHTTPServerTransport>();
  const sessionCredentialsMap = new Map<string, SessionCredentials>();
  const transportSessionIds = new Map<StreamableHTTPServerTransport, string>();
  const sessionLastActivity = new Map<string, number>();

  const SESSION_TTL_MS = 30 * 60 * 1000;
  const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, lastActivity] of sessionLastActivity) {
      if (now - lastActivity > SESSION_TTL_MS) {
        const transport = transports.get(sid);
        if (transport) {
          transport.close().catch(() => {});
        }
        sessionLastActivity.delete(sid);
        process.stderr.write(
          `teams mcp: session expired (idle ${Math.round((now - lastActivity) / 1000 / 60)}m): ${sid}\n`,
        );
      }
    }
  }, SWEEP_INTERVAL_MS);
  sweepInterval.unref();

  function extractCredentials(req: express.Request): SessionCredentials {
    const extra = req.auth?.extra as Record<string, unknown> | undefined;
    return { msalAccountId: (extra?.msalAccountId as string) ?? "" };
  }

  // POST /mcp
  app.post("/mcp", bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const credentials = extractCredentials(req);

    try {
      if (sessionId && transports.has(sessionId)) {
        sessionLastActivity.set(sessionId, Date.now());
        const transport = transports.get(sessionId)!;
        await sessionStore.run(credentials, async () => {
          await transport.handleRequest(req, res, req.body);
        });
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            process.stderr.write(`teams mcp: session created: ${sid}\n`);
            transports.set(sid, transport);
            sessionCredentialsMap.set(sid, credentials);
            transportSessionIds.set(transport, sid);
            sessionLastActivity.set(sid, Date.now());
          },
        });

        transport.onclose = () => {
          const sid = transportSessionIds.get(transport);
          if (sid) {
            transports.delete(sid);
            sessionCredentialsMap.delete(sid);
            sessionLastActivity.delete(sid);
            transportSessionIds.delete(transport);
            process.stderr.write(`teams mcp: session closed: ${sid}\n`);
          }
        };

        const server = await createTeamsServer(config);
        await server.connect(transport);

        await sessionStore.run(credentials, async () => {
          await transport.handleRequest(req, res, req.body);
        });
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
    } catch (error) {
      process.stderr.write(`teams mcp: MCP request error: ${error}\n`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream
  app.get("/mcp", bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    sessionLastActivity.set(sessionId, Date.now());
    const transport = transports.get(sessionId)!;
    const credentials = sessionCredentialsMap.get(sessionId);
    if (!credentials) {
      process.stderr.write(`teams mcp: no credentials for session: ${sessionId}\n`);
      res.status(401).send("Session credentials not found");
      return;
    }
    await sessionStore.run(credentials, async () => {
      await transport.handleRequest(req, res);
    });
  });

  // DELETE /mcp — session termination
  app.delete("/mcp", bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // Health check (no auth)
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      sessions: transports.size,
      ts: new Date().toISOString(),
    });
  });

  const onListening = () => {
    process.stderr.write(
      `teams mcp: server listening on ${scheme}://${config.host}:${config.port}\n`,
    );
  };

  const server: HttpServer | HttpsServer = tlsOptions
    ? https
        .createServer(tlsOptions, app)
        .listen(config.port, config.host, onListening)
    : app.listen(config.port, config.host, onListening);

  return {
    stop: () => {
      clearInterval(sweepInterval);
      for (const [sid, transport] of transports) {
        try {
          transport.close();
          transports.delete(sid);
          sessionCredentialsMap.delete(sid);
        } catch {
          // close 실패 무시
        }
      }
      server.close();
    },
  };
}
