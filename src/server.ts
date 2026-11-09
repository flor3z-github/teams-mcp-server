import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Config } from "./config.js";
import { initAuth } from "./graph/auth.js";
import { initStore, sweepExpired } from "./auth/store.js";
import { startHttpServer } from "./http-server.js";
import { createTeamsServer } from "./mcp-server.js";

export async function runServer(config: Config): Promise<void> {
  initAuth(config.stateDir);

  // stdio: 단일 사용자. OAuth/HTTP 없이 MSAL 캐시의 계정을 쓴다 (mcp-server.ts).
  if (config.transport === "stdio") {
    const mcp = await createTeamsServer(config);
    await mcp.connect(new StdioServerTransport());
    process.stderr.write("teams mcp: stdio transport ready\n");
    return;
  }

  initStore(config.stateDir);

  const httpServer = startHttpServer(config);

  // 1시간마다 만료된 토큰 정리
  const sweepInterval = setInterval(() => sweepExpired(), 60 * 60 * 1000);

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write("teams mcp: shutting down\n");
    clearInterval(sweepInterval);
    httpServer.stop();
    setTimeout(() => process.exit(0), 2000);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
