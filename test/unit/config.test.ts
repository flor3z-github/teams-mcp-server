import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// loadConfig를 매 테스트마다 새로 import하기 위해 dynamic import 사용
describe("loadConfig", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("기본값으로 config 반환", async () => {
    delete process.env.TEAMS_PORT;
    delete process.env.TEAMS_STATE_DIR;
    delete process.env.LOG_LEVEL;
    const { loadConfig } = await import("../../src/config.js");
    const config = loadConfig();
    expect(config.port).toBe(3978);
    expect(config.logLevel).toBe("info");
    expect(config.stateDir).toContain(".claude");
  });

  it("환경변수로 port 설정", async () => {
    process.env.TEAMS_PORT = "4000";
    delete process.env.LOG_LEVEL;
    const { loadConfig } = await import("../../src/config.js");
    const config = loadConfig();
    expect(config.port).toBe(4000);
  });

  it("환경변수로 logLevel 설정", async () => {
    delete process.env.TEAMS_PORT;
    process.env.LOG_LEVEL = "debug";
    const { loadConfig } = await import("../../src/config.js");
    const config = loadConfig();
    expect(config.logLevel).toBe("debug");
  });

  it("잘못된 logLevel이면 exit", async () => {
    process.env.LOG_LEVEL = "invalid_level";
    delete process.env.TEAMS_PORT;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const { loadConfig } = await import("../../src/config.js");
    expect(() => loadConfig()).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
