import { loadConfig } from "./config.js";
import { runServer } from "./server.js";
import { initAuth, acquireTokenDeviceCode } from "./graph/auth.js";

// 글로벌 에러 핸들러
process.on("unhandledRejection", (err) => {
  process.stderr.write(
    `[${new Date().toISOString()}] teams mcp: unhandled rejection: ${err}\n`,
  );
});
process.on("uncaughtException", (err) => {
  process.stderr.write(
    `[${new Date().toISOString()}] teams mcp: uncaught exception: ${err}\n`,
  );
});

const config = loadConfig();

// `bun run login`: stdio 모드용 1회 로그인. 토큰은 MSAL 캐시에 저장된다.
if (process.argv[2] === "login") {
  initAuth(config.stateDir);
  try {
    const result = await acquireTokenDeviceCode((message) => {
      process.stderr.write(`${message}\n`);
    });
    process.stderr.write(
      `teams mcp: logged in as ${result.account?.username ?? "unknown"}\n`,
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`teams mcp: login failed: ${err}\n`);
    process.exit(1);
  }
} else {
  await runServer(config);
}
