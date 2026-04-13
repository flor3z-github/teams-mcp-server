import { randomUUID } from "node:crypto";
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

export function startHttpServer(config: Config): HttpServerHandle {
  const provider = new TeamsOAuthProvider(config.port);
  const issuerUrl = new URL(`http://localhost:${config.port}`);

  const app = express();

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

  // POST /mcp
  app.post("/mcp", bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    const credentials: SessionCredentials = {
      msalAccountId: (
        req.auth?.extra as Record<string, unknown> | undefined
      )?.msalAccountId as string,
    };

    try {
      if (sessionId && transports.has(sessionId)) {
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
          },
        });

        transport.onclose = () => {
          const sid = (transport as any).sessionId as string;
          if (sid) {
            transports.delete(sid);
            sessionCredentialsMap.delete(sid);
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
    const transport = transports.get(sessionId)!;
    const credentials = sessionCredentialsMap.get(sessionId) ?? {
      msalAccountId: "",
    };
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

  const server = app.listen(config.port, "0.0.0.0", () => {
    process.stderr.write(
      `teams mcp: server listening on 0.0.0.0:${config.port}\n`,
    );
  });

  return {
    stop: () => {
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
