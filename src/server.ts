import type { Config } from "./config.js";
import { initAuth } from "./graph/auth.js";
import { initStore, sweepExpired } from "./auth/store.js";
import { startHttpServer } from "./http-server.js";

export async function runServer(config: Config): Promise<void> {
  initAuth(config.stateDir);
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
