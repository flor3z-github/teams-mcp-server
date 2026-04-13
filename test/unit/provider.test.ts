import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rmSync } from "node:fs";

vi.mock("../../src/graph/auth.js", () => ({
  acquireTokenDeviceCode: vi.fn(),
  initAuth: vi.fn(),
  getAccountById: vi.fn(),
  getToken: vi.fn(),
  acquireTokenSilentForAccount: vi.fn(),
}));

import { initStore, storeAuthCode, storeRefreshToken, getAccessToken, getRefreshToken } from "../../src/auth/store.js";
import { TeamsOAuthProvider, pollDeviceFlow, startDeviceFlow, getDeviceFlowAccountId } from "../../src/auth/provider.js";
import { acquireTokenDeviceCode } from "../../src/graph/auth.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

const mockAcquireTokenDeviceCode = vi.mocked(acquireTokenDeviceCode);

const dummyClient: OAuthClientInformationFull = {
  client_id: "test-client",
  client_id_issued_at: 0,
  redirect_uris: ["http://localhost:3000/callback"],
  grant_types: ["authorization_code"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

let tmpDir: string;
let provider: TeamsOAuthProvider;

beforeEach(() => {
  tmpDir = join(tmpdir(), `provider-test-${randomUUID()}`);
  initStore(tmpDir);
  provider = new TeamsOAuthProvider(3978);
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- exchangeAuthorizationCode ---

describe("exchangeAuthorizationCode", () => {
  it("auth code 저장 후 exchange → access_token, refresh_token, expires_in 반환", async () => {
    storeAuthCode("code-1", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      codeChallenge: "challenge",
      redirectUri: "http://localhost:3000/callback",
      scopes: ["User.Read"],
    });

    const tokens = await provider.exchangeAuthorizationCode(dummyClient, "code-1");
    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.expires_in).toBeGreaterThan(0);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope).toBe("User.Read");
  });

  it("exchange 후 auth code는 소모됨 (재사용 시 throw)", async () => {
    storeAuthCode("code-2", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      codeChallenge: "challenge",
      redirectUri: "http://localhost:3000/callback",
      scopes: [],
    });

    await provider.exchangeAuthorizationCode(dummyClient, "code-2");
    await expect(
      provider.exchangeAuthorizationCode(dummyClient, "code-2"),
    ).rejects.toThrow("Invalid or expired authorization code");
  });

  it("존재하지 않는 auth code로 exchange 시 throw", async () => {
    await expect(
      provider.exchangeAuthorizationCode(dummyClient, "nonexistent"),
    ).rejects.toThrow("Invalid or expired authorization code");
  });
});

// --- exchangeRefreshToken ---

describe("exchangeRefreshToken", () => {
  it("refresh token으로 exchange → 새 access+refresh token 발급", async () => {
    storeRefreshToken("rt-1", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      scopes: ["User.Read"],
    });

    const tokens = await provider.exchangeRefreshToken(dummyClient, "rt-1");
    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.access_token).not.toBe("rt-1");
  });

  it("이전 refresh token은 삭제됨 (재사용 시 throw)", async () => {
    storeRefreshToken("rt-2", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      scopes: [],
    });

    await provider.exchangeRefreshToken(dummyClient, "rt-2");
    await expect(
      provider.exchangeRefreshToken(dummyClient, "rt-2"),
    ).rejects.toThrow("Invalid refresh token");
  });

  it("존재하지 않는 refresh token으로 exchange 시 throw", async () => {
    await expect(
      provider.exchangeRefreshToken(dummyClient, "nonexistent"),
    ).rejects.toThrow("Invalid refresh token");
  });
});

// --- verifyAccessToken ---

describe("verifyAccessToken", () => {
  it("유효한 access token → AuthInfo 반환, extra.msalAccountId 포함", async () => {
    storeAuthCode("code-v", {
      clientId: "test-client",
      msalAccountId: "acct-verify",
      codeChallenge: "ch",
      redirectUri: "http://localhost:3000/callback",
      scopes: ["User.Read"],
    });
    const tokens = await provider.exchangeAuthorizationCode(dummyClient, "code-v");

    const authInfo = await provider.verifyAccessToken(tokens.access_token);
    expect(authInfo.token).toBe(tokens.access_token);
    expect(authInfo.clientId).toBe("test-client");
    expect(authInfo.scopes).toEqual(["User.Read"]);
    expect(authInfo.extra?.msalAccountId).toBe("acct-verify");
  });

  it("존재하지 않는 token → throw", async () => {
    await expect(
      provider.verifyAccessToken("bad-token"),
    ).rejects.toThrow("Invalid or expired access token");
  });
});

// --- revokeToken ---

describe("revokeToken", () => {
  it("token_type_hint가 access_token이면 access token만 삭제", async () => {
    storeAuthCode("code-r1", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      codeChallenge: "ch",
      redirectUri: "http://localhost:3000/callback",
      scopes: [],
    });
    const tokens = await provider.exchangeAuthorizationCode(dummyClient, "code-r1");

    await provider.revokeToken(dummyClient, {
      token: tokens.access_token,
      token_type_hint: "access_token",
    });

    expect(getAccessToken(tokens.access_token)).toBeUndefined();
    expect(getRefreshToken(tokens.refresh_token!)).toBeDefined();
  });

  it("token_type_hint가 refresh_token이면 refresh token만 삭제", async () => {
    storeAuthCode("code-r2", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      codeChallenge: "ch",
      redirectUri: "http://localhost:3000/callback",
      scopes: [],
    });
    const tokens = await provider.exchangeAuthorizationCode(dummyClient, "code-r2");

    await provider.revokeToken(dummyClient, {
      token: tokens.refresh_token!,
      token_type_hint: "refresh_token",
    });

    expect(getAccessToken(tokens.access_token)).toBeDefined();
    expect(getRefreshToken(tokens.refresh_token!)).toBeUndefined();
  });

  it("hint 없으면 양쪽 모두 시도", async () => {
    storeAuthCode("code-r3", {
      clientId: "test-client",
      msalAccountId: "acct-1",
      codeChallenge: "ch",
      redirectUri: "http://localhost:3000/callback",
      scopes: [],
    });
    const tokens = await provider.exchangeAuthorizationCode(dummyClient, "code-r3");

    await provider.revokeToken(dummyClient, {
      token: tokens.access_token,
    });

    expect(getAccessToken(tokens.access_token)).toBeUndefined();
  });
});

// --- handleDeviceCallback ---

describe("handleDeviceCallback", () => {
  it("잘못된 authSessionToken → error", () => {
    const result = provider.handleDeviceCallback("bad-session", "some-flow");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Invalid or expired auth session");
    }
  });
});

// --- pollDeviceFlow ---

describe("pollDeviceFlow", () => {
  it("존재하지 않는 flowId → null", () => {
    expect(pollDeviceFlow("nonexistent-flow")).toBeNull();
  });

  it("진행 중인 flow → completed: false", () => {
    mockAcquireTokenDeviceCode.mockReturnValue(new Promise(() => {})); // never resolves

    const { flowId } = startDeviceFlow();
    const status = pollDeviceFlow(flowId);
    expect(status).toBeDefined();
    expect(status!.completed).toBe(false);
  });
});

// --- getDeviceFlowAccountId ---

describe("getDeviceFlowAccountId", () => {
  it("미완료 flow → null", () => {
    mockAcquireTokenDeviceCode.mockReturnValue(new Promise(() => {}));

    const { flowId } = startDeviceFlow();
    expect(getDeviceFlowAccountId(flowId)).toBeNull();
  });
});
