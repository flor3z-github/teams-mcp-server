import type { Config } from "./config.js";
import { initAuth } from "./graph/auth.js";
import { initStore } from "./auth/store.js";
import { startHttpServer } from "./http-server.js";

export async function runServer(config: Config): Promise<void> {
  initAuth(config.stateDir);
  initStore(config.stateDir);

  const httpServer = startHttpServer(config);

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write("teams mcp: shutting down\n");
    httpServer.stop();
    setTimeout(() => process.exit(0), 2000);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
