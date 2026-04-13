import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../src/config.js";

vi.mock("../../src/graph/auth.js", () => ({
  getAccountById: vi.fn(),
  initAuth: vi.fn(),
  getToken: vi.fn(),
  acquireTokenSilentForAccount: vi.fn(),
  acquireTokenDeviceCode: vi.fn(),
}));

vi.mock("../../src/context.js", () => ({
  sessionStore: { getStore: vi.fn() },
}));

import { authTools, authHandlers } from "../../src/tools/auth.js";
import { getAccountById } from "../../src/graph/auth.js";
import { sessionStore } from "../../src/context.js";

const mockGetAccountById = vi.mocked(getAccountById);
const mockGetStore = vi.mocked(sessionStore.getStore);

const dummyConfig: Config = {
  port: 3978,
  stateDir: "/tmp/test",
  logLevel: "info",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("도구 목록", () => {
  it("authTools에 auth_status, auth_login 두 도구가 정의됨", () => {
    const names = authTools.map((t) => t.name);
    expect(names).toContain("auth_status");
    expect(names).toContain("auth_login");
    expect(names).toHaveLength(2);
  });

  it("authHandlers에 auth_status, auth_login 핸들러가 등록됨", () => {
    expect(authHandlers.auth_status).toBeDefined();
    expect(authHandlers.auth_login).toBeDefined();
  });
});

describe("auth_status (세션 없음)", () => {
  it("sessionStore.getStore()가 undefined일 때 Not authenticated 메시지", async () => {
    mockGetStore.mockReturnValue(undefined);

    const result = await authHandlers.auth_status({}, dummyConfig);
    expect(result.content[0].text).toContain("Not authenticated");
  });
});

describe("auth_status (세션 있으나 계정 없음)", () => {
  it("getAccountById가 null이면 account not found 메시지", async () => {
    mockGetStore.mockReturnValue({ msalAccountId: "test-id" });
    mockGetAccountById.mockResolvedValue(null);

    const result = await authHandlers.auth_status({}, dummyConfig);
    expect(result.content[0].text).toContain("account not found in MSAL cache");
  });
});

describe("auth_status (정상)", () => {
  it("유효한 계정이면 Authenticated as 메시지", async () => {
    mockGetStore.mockReturnValue({ msalAccountId: "test-id" });
    mockGetAccountById.mockResolvedValue({
      name: "Test User",
      username: "test@example.com",
      tenantId: "tenant-1",
      homeAccountId: "test-id",
      environment: "login.microsoftonline.com",
      localAccountId: "local-1",
    });

    const result = await authHandlers.auth_status({}, dummyConfig);
    expect(result.content[0].text).toContain("Authenticated as: Test User");
    expect(result.content[0].text).toContain("Account: test@example.com");
    expect(result.content[0].text).toContain("Tenant: tenant-1");
  });
});

describe("auth_login은 auth_status와 동일", () => {
  it("authHandlers.auth_login === authHandlers.auth_status (같은 함수 참조)", () => {
    expect(authHandlers.auth_login).toBe(authHandlers.auth_status);
  });
});
