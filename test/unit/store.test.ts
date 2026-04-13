import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import {
  initStore,
  registerClient,
  getClient,
  storeAuthCode,
  getAuthCode,
  deleteAuthCode,
  storeAccessToken,
  getAccessToken,
  deleteAccessToken,
  storeRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  sweepExpired,
  AUTH_CODE_TTL,
  ACCESS_TOKEN_TTL,
} from "../../src/auth/store.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `store-test-${randomUUID()}`);
  initStore(tmpDir);
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- initStore ---

describe("initStore", () => {
  it("빈 디렉토리에서 초기화 시 빈 store 생성", () => {
    expect(getClient("nonexistent")).toBeUndefined();
  });

  it("기존 JSON 파일이 있으면 로드", () => {
    const data = {
      clients: {
        "c1": {
          client_id: "c1",
          client_id_issued_at: 100,
          redirect_uris: [],
          grant_types: [],
          response_types: [],
          token_endpoint_auth_method: "none",
        },
      },
      authCodes: {},
      accessTokens: {},
      refreshTokens: {},
    };
    writeFileSync(join(tmpDir, "oauth-store.json"), JSON.stringify(data));

    initStore(tmpDir);
    expect(getClient("c1")).toBeDefined();
    expect(getClient("c1")!.client_id).toBe("c1");
  });

  it("corrupt JSON 파일이면 빈 store로 시작", () => {
    writeFileSync(join(tmpDir, "oauth-store.json"), "NOT VALID JSON{{{");

    initStore(tmpDir);
    expect(getClient("any")).toBeUndefined();
  });
});

// --- Client CRUD ---

describe("Client CRUD", () => {
  it("registerClient로 등록 후 getClient로 조회 가능", () => {
    const client = registerClient({
      redirect_uris: ["http://localhost"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    expect(client.client_id).toBeDefined();
    expect(typeof client.client_id).toBe("string");
    expect(client.client_id_issued_at).toBeGreaterThan(0);

    const found = getClient(client.client_id);
    expect(found).toBeDefined();
    expect(found!.client_id).toBe(client.client_id);
  });

  it("존재하지 않는 clientId는 undefined 반환", () => {
    expect(getClient("nonexistent-id")).toBeUndefined();
  });
});

// --- Auth Code CRUD + TTL ---

describe("Auth Code CRUD + TTL", () => {
  it("storeAuthCode 후 getAuthCode로 조회 가능", () => {
    storeAuthCode("code1", {
      clientId: "c1",
      msalAccountId: "acct1",
      codeChallenge: "challenge",
      redirectUri: "http://localhost",
      scopes: ["User.Read"],
    });

    const record = getAuthCode("code1");
    expect(record).toBeDefined();
    expect(record!.clientId).toBe("c1");
    expect(record!.msalAccountId).toBe("acct1");
    expect(record!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("deleteAuthCode 후 undefined 반환", () => {
    storeAuthCode("code2", {
      clientId: "c1",
      msalAccountId: "acct1",
      codeChallenge: "challenge",
      redirectUri: "http://localhost",
      scopes: [],
    });
    deleteAuthCode("code2");
    expect(getAuthCode("code2")).toBeUndefined();
  });

  it("만료된 auth code는 getAuthCode에서 undefined 반환", () => {
    vi.useFakeTimers();

    storeAuthCode("code3", {
      clientId: "c1",
      msalAccountId: "acct1",
      codeChallenge: "challenge",
      redirectUri: "http://localhost",
      scopes: [],
    });

    expect(getAuthCode("code3")).toBeDefined();

    vi.advanceTimersByTime(AUTH_CODE_TTL + 1);

    expect(getAuthCode("code3")).toBeUndefined();
  });
});

// --- Access Token CRUD + TTL ---

describe("Access Token CRUD + TTL", () => {
  it("storeAccessToken 후 getAccessToken 조회", () => {
    storeAccessToken("tok1", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: ["User.Read"],
    });

    const record = getAccessToken("tok1");
    expect(record).toBeDefined();
    expect(record!.clientId).toBe("c1");
    expect(record!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("만료된 access token은 undefined 반환", () => {
    vi.useFakeTimers();

    storeAccessToken("tok2", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: [],
    });

    expect(getAccessToken("tok2")).toBeDefined();

    vi.advanceTimersByTime(ACCESS_TOKEN_TTL + 1);

    expect(getAccessToken("tok2")).toBeUndefined();
  });
});

// --- Refresh Token CRUD ---

describe("Refresh Token CRUD", () => {
  it("storeRefreshToken 후 getRefreshToken 조회", () => {
    storeRefreshToken("rt1", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: ["User.Read"],
    });

    const record = getRefreshToken("rt1");
    expect(record).toBeDefined();
    expect(record!.clientId).toBe("c1");
  });

  it("deleteRefreshToken 후 undefined 반환", () => {
    storeRefreshToken("rt2", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: [],
    });
    deleteRefreshToken("rt2");
    expect(getRefreshToken("rt2")).toBeUndefined();
  });
});

// --- sweepExpired ---

describe("sweepExpired", () => {
  it("만료된 authCode와 accessToken만 정리, refreshToken은 유지", () => {
    vi.useFakeTimers();

    storeAuthCode("exp-code", {
      clientId: "c1",
      msalAccountId: "acct1",
      codeChallenge: "ch",
      redirectUri: "http://localhost",
      scopes: [],
    });
    storeAccessToken("exp-tok", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: [],
    });
    storeRefreshToken("keep-rt", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: [],
    });

    // auth code만 만료 (5분 + 1ms)
    vi.advanceTimersByTime(AUTH_CODE_TTL + 1);

    const swept = sweepExpired();
    // auth code 1개 만료, access token은 아직 유효
    expect(swept).toBe(1);
    expect(getAuthCode("exp-code")).toBeUndefined();
    expect(getAccessToken("exp-tok")).toBeDefined();
    expect(getRefreshToken("keep-rt")).toBeDefined();
  });

  it("만료된 항목이 없으면 0 반환", () => {
    storeRefreshToken("rt-only", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: [],
    });
    expect(sweepExpired()).toBe(0);
  });
});

// --- 영속화 ---

describe("영속화", () => {
  it("mutation 후 queueMicrotask가 flush되면 JSON 파일에 기록됨", async () => {
    storeRefreshToken("persist-rt", {
      clientId: "c1",
      msalAccountId: "acct1",
      scopes: ["User.Read"],
    });

    // queueMicrotask flush 대기
    await new Promise<void>((r) => queueMicrotask(r));

    const file = join(tmpDir, "oauth-store.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(data.refreshTokens["persist-rt"]).toBeDefined();
    expect(data.refreshTokens["persist-rt"].clientId).toBe("c1");
  });
});
