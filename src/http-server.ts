import {
  createServer as createNodeServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CloudAdapter } from "botbuilder";
import type { Config } from "./config.js";
import { createTeamsServer } from "./mcp-server.js";
import { acquireTokenDeviceCode, acquireTokenSilent } from "./graph/auth.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: import("@modelcontextprotocol/sdk/server/index.js").Server;
}

const sessions = new Map<string, SessionEntry>();

// ─── Device Code Flow 상태 ───

interface DeviceFlow {
  deviceMessage: string | null;
  completed: boolean;
  error: string | null;
}

const deviceFlows = new Map<string, DeviceFlow>();

export interface HttpServerHandle {
  stop(): void;
}

export function startHttpServer(
  adapter: CloudAdapter | null,
  botHandler: unknown,
  config: Config,
): HttpServerHandle {
  if (config.transport === "http") {
    return startHttpModeServer(config);
  }
  return startStdioModeServer(adapter!, botHandler, config);
}

// ─── stdio 모드: Bun.serve (Bot Framework + Health) ───

function startStdioModeServer(
  adapter: CloudAdapter,
  botHandler: unknown,
  config: Config,
): HttpServerHandle {
  const server = Bun.serve({
    port: config.port,
    hostname: "0.0.0.0",
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/api/messages") {
        try {
          const res = await adapter.process(req, botHandler as any);
          return res as Response;
        } catch (err) {
          process.stderr.write(`teams chat: adapter.process error: ${err}\n`);
          return new Response("Internal Server Error", { status: 500 });
        }
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({
          status: "ok",
          mode: "stdio",
          ts: new Date().toISOString(),
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return { stop: () => server.stop() };
}

// ─── http 모드: node:http (MCP StreamableHTTP + Health) ───
// StreamableHTTPServerTransport는 Node.js IncomingMessage/ServerResponse를 기대

function startHttpModeServer(
  config: Config,
): HttpServerHandle {
  const server = createNodeServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${config.port}`);

    try {
      if (url.pathname === "/mcp") {
        if (req.method === "POST") {
          const body = await readBody(req);
          const parsed = JSON.parse(body);
          const sessionId = req.headers["mcp-session-id"] as string | undefined;

          if (!sessionId && isInitializeRequest(parsed)) {
            // 세션마다 새 MCP Server + Transport 생성
            const sessionServer = await createTeamsServer(config);
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
              onsessioninitialized: (sid) => {
                sessions.set(sid, { transport, server: sessionServer });
              },
            });

            transport.onclose = () => {
              const sid = (transport as any).sessionId as string;
              if (sid) sessions.delete(sid);
            };

            await sessionServer.connect(transport);
            await transport.handleRequest(req, res, parsed);
            return;
          }

          if (sessionId && sessions.has(sessionId)) {
            await sessions.get(sessionId)!.transport.handleRequest(req, res, parsed);
            return;
          }

          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Bad Request");
          return;
        }

        if (req.method === "GET") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId && sessions.has(sessionId)) {
            await sessions.get(sessionId)!.transport.handleRequest(req, res);
            return;
          }
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Session not found");
          return;
        }

        if (req.method === "DELETE") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId && sessions.has(sessionId)) {
            const entry = sessions.get(sessionId)!;
            await entry.transport.close();
            sessions.delete(sessionId);
            res.writeHead(200);
            res.end("OK");
            return;
          }
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Session not found");
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, { status: "ok", mode: "http", ts: new Date().toISOString() });
        return;
      }

      // ─── OAuth 2.0 Discovery & Token Endpoints (local dev) ───

      if (
        req.method === "GET" &&
        url.pathname === "/.well-known/oauth-protected-resource"
      ) {
        sendJson(res, {
          resource: `http://localhost:${config.port}/mcp`,
          authorization_servers: [`http://localhost:${config.port}`],
        });
        return;
      }

      if (
        req.method === "GET" &&
        url.pathname === "/.well-known/oauth-authorization-server"
      ) {
        const base = `http://localhost:${config.port}`;
        sendJson(res, {
          issuer: base,
          authorization_endpoint: `${base}/oauth/authorize`,
          token_endpoint: `${base}/oauth/token`,
          registration_endpoint: `${base}/oauth/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "client_credentials"],
          code_challenge_methods_supported: ["S256"],
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/oauth/register") {
        const regBody = await readBody(req);
        const regParsed = JSON.parse(regBody) as {
          redirect_uris?: string[];
          client_name?: string;
        };
        sendJson(res, {
          client_id: "teams-mcp-local",
          client_secret: "local-secret",
          client_id_issued_at: Math.floor(Date.now() / 1000),
          redirect_uris: regParsed.redirect_uris ?? [],
          client_name: regParsed.client_name ?? "teams-mcp",
        }, 201);
        return;
      }

      // Authorization endpoint — device code flow or instant redirect if already authed
      if (req.method === "GET" && url.pathname === "/oauth/authorize") {
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state") ?? "";
        if (!redirectUri) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing redirect_uri");
          return;
        }

        // 이미 Graph 인증 완료 → 즉시 redirect
        const silent = await acquireTokenSilent();
        if (silent) {
          const redirect = new URL(redirectUri);
          redirect.searchParams.set("code", "graph-authenticated");
          if (state) redirect.searchParams.set("state", state);
          res.writeHead(302, { Location: redirect.toString() });
          res.end();
          return;
        }

        // 미인증 → device code flow HTML 페이지 서빙
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildDeviceCodePage(redirectUri, state, config.port));
        return;
      }

      // Device code flow 시작
      if (req.method === "POST" && url.pathname === "/oauth/device-start") {
        const flowId = crypto.randomUUID();
        const flow: DeviceFlow = {
          deviceMessage: null,
          completed: false,
          error: null,
        };
        deviceFlows.set(flowId, flow);
        setTimeout(() => deviceFlows.delete(flowId), 10 * 60 * 1000);

        // MSAL device code flow를 백그라운드로 시작
        acquireTokenDeviceCode((message) => {
          flow.deviceMessage = message;
        })
          .then(() => {
            flow.completed = true;
          })
          .catch((err) => {
            flow.error = String(err);
          });

        sendJson(res, { flowId });
        return;
      }

      // Device code flow 폴링 (deviceMessage + completed 상태)
      if (req.method === "GET" && url.pathname === "/oauth/device-poll") {
        const flowId = url.searchParams.get("flow_id");
        const flow = flowId ? deviceFlows.get(flowId) : null;
        if (!flow) {
          sendJson(res, { error: "Flow not found" }, 404);
          return;
        }
        sendJson(res, {
          deviceMessage: flow.deviceMessage,
          completed: flow.completed,
          error: flow.error,
        });
        if (flow.completed || flow.error) deviceFlows.delete(flowId!);
        return;
      }

      // Token endpoint — MCP transport token 발급
      if (req.method === "POST" && url.pathname === "/oauth/token") {
        sendJson(res, {
          access_token: "teams-mcp-local-token",
          token_type: "bearer",
          expires_in: 86400,
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err) {
      process.stderr.write(`teams chat: HTTP error: ${err}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    }
  });

  server.listen(config.port, "0.0.0.0");

  return { stop: () => server.close() };
}

// ─── Helpers ───

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function buildDeviceCodePage(
  redirectUri: string,
  state: string,
  port: number,
): string {
  // redirectUri와 state를 안전하게 JSON 인코딩
  const safeRedirect = JSON.stringify(redirectUri);
  const safeState = JSON.stringify(state);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teams MCP — Sign in with Microsoft</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; justify-content: center; align-items: center;
         min-height: 100vh; background: #f5f5f5; color: #333; }
  .card { background: #fff; border-radius: 12px; padding: 48px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.1); max-width: 480px; width: 100%;
          text-align: center; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .subtitle { color: #666; margin-bottom: 32px; }
  .code-box { background: #f0f0f0; border-radius: 8px; padding: 20px;
              margin: 24px 0; font-size: 32px; font-weight: bold;
              letter-spacing: 4px; font-family: monospace; }
  .step { text-align: left; margin: 16px 0; padding: 12px 16px;
          background: #fafafa; border-radius: 8px; }
  .step-num { display: inline-block; width: 24px; height: 24px;
              background: #0078d4; color: #fff; border-radius: 50%;
              text-align: center; line-height: 24px; font-size: 13px;
              margin-right: 8px; }
  a { color: #0078d4; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  .spinner { display: inline-block; width: 16px; height: 16px;
             border: 2px solid #ccc; border-top-color: #0078d4;
             border-radius: 50%; animation: spin 0.8s linear infinite;
             vertical-align: middle; margin-right: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status { margin-top: 24px; color: #666; font-size: 14px; }
  .success { color: #107c10; font-weight: 600; }
  .error { color: #d13438; }
</style>
</head>
<body>
<div class="card">
  <h1>Teams MCP Server</h1>
  <p class="subtitle">Sign in with your Microsoft account</p>
  <div id="loading">Loading...</div>
  <div id="flow" style="display:none">
    <div class="step">
      <span class="step-num">1</span>
      Open <a id="ms-link" href="https://microsoft.com/devicelogin" target="_blank">microsoft.com/devicelogin</a>
    </div>
    <div class="code-box" id="code"></div>
    <div class="step">
      <span class="step-num">2</span>
      Enter the code above and sign in with your Microsoft account
    </div>
    <p class="status"><span class="spinner"></span> <span id="status-text">Waiting for sign-in...</span></p>
  </div>
</div>
<script>
(async () => {
  const redirectUri = ${safeRedirect};
  const state = ${safeState};
  const base = "http://localhost:${port}";

  // 1. Start device code flow
  const startRes = await fetch(base + "/oauth/device-start", { method: "POST" });
  const { flowId } = await startRes.json();
  if (!flowId) {
    document.getElementById("loading").innerHTML =
      '<p class="error">Failed to start device code flow. Is the server running?</p>';
    return;
  }

  let codeShown = false;

  // 2. Poll for device code + completion
  const poll = async () => {
    try {
      const r = await fetch(base + "/oauth/device-poll?flow_id=" + flowId);
      const { deviceMessage, completed, error } = await r.json();

      // Show device code as soon as available
      if (deviceMessage && !codeShown) {
        codeShown = true;
        const codeMatch = deviceMessage.match(/enter the code ([A-Z0-9]+)/i);
        const urlMatch = deviceMessage.match(/(https:\\/\\/[^\\s]+)/);
        document.getElementById("loading").style.display = "none";
        document.getElementById("flow").style.display = "block";
        document.getElementById("code").textContent = codeMatch ? codeMatch[1] : "See below";
        if (urlMatch) document.getElementById("ms-link").href = urlMatch[1];
      }

      if (completed) {
        document.getElementById("status-text").className = "success";
        document.getElementById("status-text").textContent = "Authenticated! Redirecting...";
        const u = new URL(redirectUri);
        u.searchParams.set("code", "graph-authenticated");
        if (state) u.searchParams.set("state", state);
        setTimeout(() => { window.location.href = u.toString(); }, 500);
        return;
      }
      if (error) {
        document.getElementById("status-text").className = "error";
        document.getElementById("status-text").textContent = "Error: " + error;
        return;
      }
      setTimeout(poll, 2000);
    } catch { setTimeout(poll, 3000); }
  };
  poll();
})();
</script>
</body>
</html>`;
}

function isInitializeRequest(body: unknown): boolean {
  if (typeof body === "object" && body !== null && "method" in body) {
    return (body as { method: string }).method === "initialize";
  }
  if (Array.isArray(body)) {
    return body.some(
      (msg) =>
        typeof msg === "object" && msg !== null && msg.method === "initialize",
    );
  }
  return false;
}
