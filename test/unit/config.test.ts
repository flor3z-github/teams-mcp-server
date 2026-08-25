import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// loadConfig를 매 테스트마다 새로 import하기 위해 dynamic import 사용
describe("loadConfig", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // 실제 홈 디렉토리의 state .env가 테스트에 섞이지 않도록 격리
    process.env.HOME = "/nonexistent-teams-mcp-test-home";
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

describe("loadConfig — host / TLS", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.TEAMS_PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.TEAMS_HOST;
    delete process.env.TEAMS_TLS_CERT;
    delete process.env.TEAMS_TLS_KEY;
    // 실제 state 디렉토리의 .env가 테스트에 섞이지 않도록 격리
    process.env.TEAMS_STATE_DIR = "/nonexistent-teams-mcp-test-state";
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("host 기본값은 127.0.0.1", async () => {
    const { loadConfig } = await import("../../src/config.js");
    const config = loadConfig();
    expect(config.host).toBe("127.0.0.1");
    expect(config.tlsCert).toBeUndefined();
    expect(config.tlsKey).toBeUndefined();
  });

  it("TEAMS_HOST로 바인딩 주소 변경", async () => {
    process.env.TEAMS_HOST = "0.0.0.0";
    const { loadConfig } = await import("../../src/config.js");
    expect(loadConfig().host).toBe("0.0.0.0");
  });

  it("TLS cert/key 둘 다 지정하면 통과", async () => {
    process.env.TEAMS_TLS_CERT = "/tmp/cert.pem";
    process.env.TEAMS_TLS_KEY = "/tmp/key.pem";
    const { loadConfig } = await import("../../src/config.js");
    const config = loadConfig();
    expect(config.tlsCert).toBe("/tmp/cert.pem");
    expect(config.tlsKey).toBe("/tmp/key.pem");
  });

  it("TLS cert만 지정하면 exit", async () => {
    process.env.TEAMS_TLS_CERT = "/tmp/cert.pem";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const { loadConfig } = await import("../../src/config.js");
    expect(() => loadConfig()).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("TLS key만 지정하면 exit", async () => {
    process.env.TEAMS_TLS_KEY = "/tmp/key.pem";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const { loadConfig } = await import("../../src/config.js");
    expect(() => loadConfig()).toThrow("process.exit");
    exitSpy.mockRestore();
  });
});
