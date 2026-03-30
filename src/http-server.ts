import {
  createServer as createNodeServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CloudAdapter } from "botbuilder";
import type { Config } from "./config.js";

const transports = new Map<string, StreamableHTTPServerTransport>();

export interface HttpServerHandle {
  stop(): void;
}

export function startHttpServer(
  mcp: McpServer,
  adapter: CloudAdapter | null,
  botHandler: unknown,
  config: Config,
): HttpServerHandle {
  if (config.transport === "http") {
    return startHttpModeServer(mcp, config);
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
  mcp: McpServer,
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
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
              onsessioninitialized: (sid) => {
                transports.set(sid, transport);
              },
            });

            transport.onclose = () => {
              const sid = (transport as any).sessionId as string;
              if (sid) transports.delete(sid);
            };

            await mcp.connect(transport);
            await transport.handleRequest(req, res, parsed);
            return;
          }

          if (sessionId && transports.has(sessionId)) {
            await transports.get(sessionId)!.handleRequest(req, res, parsed);
            return;
          }

          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Bad Request");
          return;
        }

        if (req.method === "GET") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId && transports.has(sessionId)) {
            await transports.get(sessionId)!.handleRequest(req, res);
            return;
          }
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Session not found");
          return;
        }

        if (req.method === "DELETE") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId && transports.has(sessionId)) {
            await transports.get(sessionId)!.close();
            transports.delete(sessionId);
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
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            mode: "http",
            ts: new Date().toISOString(),
          }),
        );
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
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
