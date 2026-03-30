import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "./config.js";
import { verifyHmac } from "./hmac.js";
import { gate } from "./access.js";
import type { TeamsOutgoingWebhookPayload, ChannelMeta } from "./types.js";

const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i;

export interface HttpServer {
  stop(): void;
}

export function startHttpServer(mcp: McpServer, config: Config): HttpServer {
  const server = Bun.serve({
    port: config.port,
    hostname: "0.0.0.0",
    async fetch(req) {
      const url = new URL(req.url);

      try {
        // ─── Outgoing Webhook 수신 ───
        if (req.method === "POST" && url.pathname === "/webhook") {
          const body = await req.text();

          // 1. HMAC 검증
          const authHeader = req.headers.get("authorization") || "";
          if (!verifyHmac(body, authHeader, config.webhookSecret)) {
            return new Response("Unauthorized", { status: 401 });
          }

          // 2. 페이로드 파싱
          let payload: TeamsOutgoingWebhookPayload;
          try {
            payload = JSON.parse(body);
          } catch {
            return new Response("Bad Request", { status: 400 });
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
            return Response.json({
              type: "message",
              text: approved ? "Allowed." : "Denied.",
            });
          }

          // 5. Access gate
          const senderId = payload.from.aadObjectId;
          const gateResult = gate(senderId, payload.from.name, config);

          if (gateResult.action === "pairing") {
            return Response.json({
              type: "message",
              text:
                `Pairing required.\n` +
                `Run in Claude Code terminal:\n` +
                `/teams:access pair ${gateResult.code}`,
            });
          }
          if (gateResult.action === "deny") {
            return new Response("Forbidden", { status: 403 });
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
          return Response.json({
            type: "message",
            text: "Processing...",
          });
        }

        // ─── 헬스체크 ───
        if (req.method === "GET" && url.pathname === "/health") {
          return Response.json({
            status: "ok",
            ts: new Date().toISOString(),
          });
        }

        return new Response("Not Found", { status: 404 });
      } catch (err) {
        process.stderr.write(`teams channel: HTTP handler error: ${err}\n`);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  });

  process.stderr.write(
    `teams channel: HTTP server listening on 0.0.0.0:${config.port}\n`,
  );

  return {
    stop() {
      server.stop();
    },
  };
}
