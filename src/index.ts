import { loadConfig } from "./config.js";
import { runServer } from "./server.js";

// 글로벌 에러 핸들러
process.on("unhandledRejection", (err) => {
  process.stderr.write(
    `[${new Date().toISOString()}] teams channel: unhandled rejection: ${err}\n`,
  );
});
process.on("uncaughtException", (err) => {
  process.stderr.write(
    `[${new Date().toISOString()}] teams channel: uncaught exception: ${err}\n`,
  );
});

const config = loadConfig();
await runServer(config);
