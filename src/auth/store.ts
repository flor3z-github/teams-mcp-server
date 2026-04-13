import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// --- Types ---

interface AuthCodeRecord {
  clientId: string;
  msalAccountId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  expiresAt: number;
}

interface AccessTokenRecord {
  clientId: string;
  msalAccountId: string;
  scopes: string[];
  expiresAt: number;
}

interface RefreshTokenRecord {
  clientId: string;
  msalAccountId: string;
  scopes: string[];
}

interface StoreData {
  clients: Record<string, OAuthClientInformationFull>;
  authCodes: Record<string, AuthCodeRecord>;
  accessTokens: Record<string, AccessTokenRecord>;
  refreshTokens: Record<string, RefreshTokenRecord>;
}

// --- Constants ---

const AUTH_CODE_TTL = 5 * 60 * 1000; // 5 minutes
const ACCESS_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL / 1000;

// --- State ---

let stateDir = "";
let savePending = false;

let store: StoreData = {
  clients: {},
  authCodes: {},
  accessTokens: {},
  refreshTokens: {},
};

function getStoreFile(): string {
  return join(stateDir, "oauth-store.json");
}

// --- Persistence ---

export function initStore(dir: string): void {
  stateDir = dir;
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });

  const file = getStoreFile();
  try {
    store = JSON.parse(readFileSync(file, "utf8"));
    process.stderr.write(
      `teams mcp: oauth store loaded (${Object.keys(store.accessTokens).length} tokens)\n`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write("teams mcp: oauth store corrupt, starting fresh\n");
    }
    store = { clients: {}, authCodes: {}, accessTokens: {}, refreshTokens: {} };
  }
}

function saveStore(): void {
  const file = getStoreFile();
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * 변경을 마이크로태스크에서 한 번에 flush한다.
 * 같은 tick에서 여러 mutation이 발생해도 디스크 쓰기는 한 번만 수행한다.
 */
function scheduleSave(): void {
  if (savePending) return;
  savePending = true;
  queueMicrotask(() => {
    savePending = false;
    saveStore();
  });
}

/**
 * 만료된 auth code와 access token을 정리한다.
 */
export function sweepExpired(): number {
  const now = Date.now();
  let swept = 0;
  for (const [code, record] of Object.entries(store.authCodes)) {
    if (now > record.expiresAt) {
      delete store.authCodes[code];
      swept++;
    }
  }
  for (const [token, record] of Object.entries(store.accessTokens)) {
    if (now > record.expiresAt) {
      delete store.accessTokens[token];
      swept++;
    }
  }
  if (swept > 0) scheduleSave();
  return swept;
}

// --- Clients ---

export function getClient(
  clientId: string,
): OAuthClientInformationFull | undefined {
  return store.clients[clientId];
}

export function registerClient(
  client: Omit<
    OAuthClientInformationFull,
    "client_id" | "client_id_issued_at"
  >,
): OAuthClientInformationFull {
  const clientId = randomUUID();
  const full: OAuthClientInformationFull = {
    ...client,
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  store.clients[clientId] = full;
  scheduleSave();
  process.stderr.write(`teams mcp: client registered: ${clientId}\n`);
  return full;
}

// --- Auth Codes ---

export function storeAuthCode(
  code: string,
  record: Omit<AuthCodeRecord, "expiresAt">,
): void {
  store.authCodes[code] = {
    ...record,
    expiresAt: Date.now() + AUTH_CODE_TTL,
  };
  scheduleSave();
}

export function getAuthCode(code: string): AuthCodeRecord | undefined {
  const record = store.authCodes[code];
  if (!record) return undefined;
  if (Date.now() > record.expiresAt) {
    delete store.authCodes[code];
    scheduleSave();
    return undefined;
  }
  return record;
}

export function deleteAuthCode(code: string): void {
  delete store.authCodes[code];
  scheduleSave();
}

// --- Access Tokens ---

export function storeAccessToken(
  token: string,
  record: Omit<AccessTokenRecord, "expiresAt">,
): void {
  store.accessTokens[token] = {
    ...record,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL,
  };
  scheduleSave();
}

export function getAccessToken(
  token: string,
): AccessTokenRecord | undefined {
  const record = store.accessTokens[token];
  if (!record) return undefined;
  if (Date.now() > record.expiresAt) {
    delete store.accessTokens[token];
    scheduleSave();
    return undefined;
  }
  return record;
}

export function deleteAccessToken(token: string): void {
  delete store.accessTokens[token];
  scheduleSave();
}

// --- Refresh Tokens ---

export function storeRefreshToken(
  token: string,
  record: RefreshTokenRecord,
): void {
  store.refreshTokens[token] = record;
  scheduleSave();
}

export function getRefreshToken(
  token: string,
): RefreshTokenRecord | undefined {
  return store.refreshTokens[token];
}

export function deleteRefreshToken(token: string): void {
  delete store.refreshTokens[token];
  scheduleSave();
}

export { AUTH_CODE_TTL, ACCESS_TOKEN_TTL, ACCESS_TOKEN_TTL_SECONDS };
export type {
  AuthCodeRecord,
  AccessTokenRecord,
  RefreshTokenRecord,
  StoreData,
};
