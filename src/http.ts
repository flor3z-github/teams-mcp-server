import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "./config.js";
import { verifyHmac } from "./hmac.js";
import { gate } from "./access.js";
import type { TeamsOutgoingWebhookPayload, ChannelMeta } from "./types.js";

const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i;

export interface HttpServer {
  stop(): void;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function textResponse(
  res: ServerResponse,
  status: number,
  text: string,
): void {
  res.writeHead(status, {
    "Content-Type": "text/plain",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

export function startHttpServer(mcp: McpServer, config: Config): HttpServer {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    try {
      // ─── Outgoing Webhook 수신 ───
      if (req.method === "POST" && url.pathname === "/webhook") {
        const body = await readBody(req);

        // 1. HMAC 검증
        const authHeader = req.headers["authorization"] || "";
        if (!verifyHmac(body, authHeader, config.webhookSecret)) {
          return textResponse(res, 401, "Unauthorized");
        }

        // 2. 페이로드 파싱
        let payload: TeamsOutgoingWebhookPayload;
        try {
          payload = JSON.parse(body);
        } catch {
          return textResponse(res, 400, "Bad Request");
        }

        // 3. 멘션 태그 제거
        const cleanText = payload.text
          .replace(/<at>.*?<\/at>/gi, "")
          .trim();

        // 4. Permission reply 인터셉트
        const permMatch = PERMISSION_REPLY_RE.exec(cleanText);
        if (permMatch) {
          const approved = permMatch[1]!.toLowerCase().startsWith("y");
          await mcp.notification({
            method: "notifications/claude/channel/permission",
            params: {
              request_id: permMatch[2]!.toLowerCase(),
              behavior: approved ? "allow" : "deny",
            },
          });
          return jsonResponse(res, 200, {
            type: "message",
            text: approved ? "Allowed." : "Denied.",
          });
        }

        // 5. Access gate
        const senderId = payload.from.aadObjectId;
        const gateResult = gate(senderId, payload.from.name, config);

        if (gateResult.action === "pairing") {
          return jsonResponse(res, 200, {
            type: "message",
            text:
              `Pairing required.\n` +
              `Run in Claude Code terminal:\n` +
              `/teams:access pair ${gateResult.code}`,
          });
        }
        if (gateResult.action === "deny") {
          return textResponse(res, 403, "Forbidden");
        }

        // 6. Notification meta
        const meta: ChannelMeta = {
          chat_id: payload.conversation.id,
          message_id: payload.id,
          user: payload.from.name,
          user_id: senderId,
          ts: new Date(payload.timestamp).toISOString(),
        };

        // 7. Claude Code 세션으로 채널 이벤트 전달
        await mcp.notification({
          method: "notifications/claude/channel",
          params: {
            content: cleanText,
            meta,
          },
        });

        // 8. ACK 응답
        return jsonResponse(res, 200, {
          type: "message",
          text: "Processing...",
        });
      }

      // ─── 헬스체크 ───
      if (req.method === "GET" && url.pathname === "/health") {
        return jsonResponse(res, 200, {
          status: "ok",
          ts: new Date().toISOString(),
        });
      }

      textResponse(res, 404, "Not Found");
    } catch (err) {
      process.stderr.write(`teams channel: HTTP handler error: ${err}\n`);
      if (!res.headersSent) {
        textResponse(res, 500, "Internal Server Error");
      }
    }
  });

  server.listen(config.port, "0.0.0.0", () => {
    process.stderr.write(
      `teams channel: HTTP server listening on 0.0.0.0:${config.port}\n`,
    );
  });

  return {
    stop() {
      server.close();
    },
  };
}
