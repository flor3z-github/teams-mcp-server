// 이 테스트는 Bun 런타임에서만 실행 가능합니다.
// 실행: bun test test/integration/http.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../src/config.js";
import { saveAccess } from "../../src/access.js";
import type { Access } from "../../src/types.js";
import { startHttpServer, type HttpServer } from "../../src/http.js";

// ─── Mock MCP Server ───

interface CapturedNotification {
  method: string;
  params: unknown;
}

function createMockMcp() {
  const notifications: CapturedNotification[] = [];
  return {
    notifications,
    notification: async (msg: { method: string; params: unknown }) => {
      notifications.push({ method: msg.method, params: msg.params });
    },
    setNotificationHandler: () => {},
  };
}

// ─── Helpers ───

const SECRET = randomBytes(32).toString("base64");
const TEST_PORT = 19788;

function makeConfig(stateDir: string): Config {
  return {
    webhookSecret: SECRET,
    incomingWebhookUrl: "https://example.com/webhook",
    port: TEST_PORT,
    stateDir,
    logLevel: "error",
  };
}

function hmacSign(body: string): string {
  const key = Buffer.from(SECRET, "base64");
  return createHmac("sha256", key).update(body, "utf8").digest("base64");
}

function makePayload(overrides: Record<string, unknown> = {}): string {
  const payload = {
    type: "message",
    id: "msg-1",
    timestamp: "2026-03-30T10:00:00Z",
    localTimestamp: "2026-03-30T19:00:00+09:00",
    serviceUrl: "https://smba.trafficmanager.net",
    channelId: "msteams",
    from: {
      id: "user-1",
      name: "Tester",
      aadObjectId: "aad-user-1",
    },
    conversation: { id: "conv-1", name: "test-channel" },
    recipient: { id: "bot-1", name: "claude-bot" },
    text: "<at>claude-bot</at> hello world",
    textFormat: "plain",
    channelData: {
      teamsChannelId: "ch-1",
      teamsTeamId: "team-1",
      channel: { id: "ch-1" },
      team: { id: "team-1" },
      tenant: { id: "tenant-1" },
    },
    ...overrides,
  };
  return JSON.stringify(payload);
}

async function post(
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${TEST_PORT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
  return { status: res.status, body: await res.text() };
}

async function get(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${TEST_PORT}${path}`);
  return { status: res.status, body: await res.text() };
}

// ─── Tests ───

describe("HTTP server integration", () => {
  let stateDir: string;
  let config: Config;
  let server: HttpServer;
  let mockMcp: ReturnType<typeof createMockMcp>;

  beforeEach(async () => {
    stateDir = join(
      tmpdir(),
      `teams-int-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(stateDir, { recursive: true });
    config = makeConfig(stateDir);
    mockMcp = createMockMcp();
    server = startHttpServer(mockMcp as any, config);
    // 서버가 listen할 시간을 줌
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(() => {
    server.stop();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("GET /health should return 200 with status ok", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe("ok");
    expect(data.ts).toBeDefined();
  });

  it("POST /webhook without HMAC should return 401", async () => {
    const body = makePayload();
    const res = await post("/webhook", body);
    expect(res.status).toBe(401);
  });

  it("POST /webhook with wrong HMAC should return 401", async () => {
    const body = makePayload();
    const res = await post("/webhook", body, {
      Authorization: "HMAC wrongsignature==",
    });
    expect(res.status).toBe(401);
  });

  it("POST /webhook with valid HMAC + allowed sender should return 200 and send notification", async () => {
    const access: Access = {
      dmPolicy: "allowlist",
      allowFrom: ["aad-user-1"],
      channels: {},
      pending: {},
    };
    saveAccess(access, config);

    const body = makePayload();
    const sig = hmacSign(body);
    const res = await post("/webhook", body, {
      Authorization: `HMAC ${sig}`,
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.text).toBe("Processing...");

    // MCP notification이 전달되었는지 확인
    expect(mockMcp.notifications).toHaveLength(1);
    const notif = mockMcp.notifications[0];
    expect(notif.method).toBe("notifications/claude/channel");
    const params = notif.params as any;
    expect(params.content).toBe("hello world");
    expect(params.meta.user).toBe("Tester");
    expect(params.meta.user_id).toBe("aad-user-1");
    expect(params.meta.chat_id).toBe("conv-1");
  });

  it("POST /webhook with unknown sender in allowlist mode should return 403", async () => {
    const access: Access = {
      dmPolicy: "allowlist",
      allowFrom: [],
      channels: {},
      pending: {},
    };
    saveAccess(access, config);

    const body = makePayload();
    const sig = hmacSign(body);
    const res = await post("/webhook", body, {
      Authorization: `HMAC ${sig}`,
    });

    expect(res.status).toBe(403);
  });

  it("POST /webhook with unknown sender in pairing mode should return pairing code", async () => {
    const access: Access = {
      dmPolicy: "pairing",
      allowFrom: [],
      channels: {},
      pending: {},
    };
    saveAccess(access, config);

    const body = makePayload();
    const sig = hmacSign(body);
    const res = await post("/webhook", body, {
      Authorization: `HMAC ${sig}`,
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.text).toContain("Pairing required");
    expect(data.text).toContain("/teams:access pair");
  });

  it("POST /webhook with permission reply should send permission notification", async () => {
    const access: Access = {
      dmPolicy: "allowlist",
      allowFrom: ["aad-user-1"],
      channels: {},
      pending: {},
    };
    saveAccess(access, config);

    const body = makePayload({
      text: "<at>claude-bot</at> yes abcde",
    });
    const sig = hmacSign(body);
    const res = await post("/webhook", body, {
      Authorization: `HMAC ${sig}`,
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.text).toBe("Allowed.");

    expect(mockMcp.notifications).toHaveLength(1);
    const notif = mockMcp.notifications[0];
    expect(notif.method).toBe("notifications/claude/channel/permission");
    const params = notif.params as any;
    expect(params.request_id).toBe("abcde");
    expect(params.behavior).toBe("allow");
  });

  it("POST /webhook with permission deny should send deny notification", async () => {
    const access: Access = {
      dmPolicy: "allowlist",
      allowFrom: ["aad-user-1"],
      channels: {},
      pending: {},
    };
    saveAccess(access, config);

    const body = makePayload({
      text: "<at>claude-bot</at> no fghij",
    });
    const sig = hmacSign(body);
    const res = await post("/webhook", body, {
      Authorization: `HMAC ${sig}`,
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.text).toBe("Denied.");

    const params = mockMcp.notifications[0].params as any;
    expect(params.behavior).toBe("deny");
  });

  it("GET /unknown should return 404", async () => {
    const res = await get("/nonexistent");
    expect(res.status).toBe(404);
  });
});
