import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Config } from "./config.js";
import { createBotAdapter, createBotHandler } from "./bot.js";
import { setAdapter } from "./sender.js";
import { loadFromDisk } from "./conversations.js";
import { initAuth } from "./graph/auth.js";
import { pollApproved, loadAccess, saveAccess } from "./access.js";
import { sendViaBot } from "./sender.js";
import { startHttpServer } from "./http-server.js";
import { createTeamsServer } from "./mcp-server.js";

export { createTeamsServer };

export async function runServer(config: Config): Promise<void> {
  loadFromDisk(config);
  initAuth(config.stateDir);

  const mcp = await createTeamsServer(config);

  // Bot Framework (stdio 모드에서만)
  let adapter = null;
  let botHandler = null;
  if (config.transport === "stdio") {
    adapter = createBotAdapter(config);
    botHandler = createBotHandler(mcp, config);
    setAdapter(adapter, config.appId);
  }

  // 통합 HTTP 서버
  const httpServer = startHttpServer(adapter, botHandler, config);

  process.stderr.write(
    `teams chat: server listening on 0.0.0.0:${config.port} (transport: ${config.transport})\n`,
  );

  // Transport 선택
  if (config.transport === "stdio") {
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
  }

  // approved/ 폴링
  const approvedInterval = setInterval(async () => {
    const ids = pollApproved(config);
    for (const senderId of ids) {
      const access = loadAccess(config);
      const pending = Object.entries(access.pending).find(
        ([, e]) => e.senderId === senderId,
      );
      const name = pending ? pending[1].senderName : senderId;
      const chatId = pending?.[1]?.chatId;
      if (pending) delete access.pending[pending[0]];
      if (!access.allowFrom.includes(senderId)) {
        access.allowFrom.push(senderId);
      }
      saveAccess(access, config);

      if (chatId) {
        try {
          await sendViaBot(
            chatId,
            `${name} has been approved and can now interact with Claude.`,
            config,
          );
        } catch {
          /* 전송 실패 무시 */
        }
      }
    }
  }, 5000);

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write("teams chat: shutting down\n");
    clearInterval(approvedInterval);
    httpServer.stop();
    setTimeout(() => process.exit(0), 2000);
  }

  if (config.transport === "stdio") {
    process.stdin.on("end", shutdown);
    process.stdin.on("close", shutdown);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
