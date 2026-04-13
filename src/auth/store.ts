import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
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

// --- State ---

let stateDir = "";

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
  if (existsSync(file)) {
    try {
      store = JSON.parse(readFileSync(file, "utf8"));
      process.stderr.write(
        `teams mcp: oauth store loaded (${Object.keys(store.accessTokens).length} tokens)\n`,
      );
    } catch {
      process.stderr.write("teams mcp: oauth store corrupt, starting fresh\n");
      store = { clients: {}, authCodes: {}, accessTokens: {}, refreshTokens: {} };
    }
  }
}

function saveStore(): void {
  const file = getStoreFile();
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
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
  saveStore();
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
  saveStore();
}

export function getAuthCode(code: string): AuthCodeRecord | undefined {
  const record = store.authCodes[code];
  if (!record) return undefined;
  if (Date.now() > record.expiresAt) {
    delete store.authCodes[code];
    saveStore();
    return undefined;
  }
  return record;
}

export function deleteAuthCode(code: string): void {
  delete store.authCodes[code];
  saveStore();
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
  saveStore();
}

export function getAccessToken(
  token: string,
): AccessTokenRecord | undefined {
  const record = store.accessTokens[token];
  if (!record) return undefined;
  if (Date.now() > record.expiresAt) {
    delete store.accessTokens[token];
    saveStore();
    return undefined;
  }
  return record;
}

export function deleteAccessToken(token: string): void {
  delete store.accessTokens[token];
  saveStore();
}

// --- Refresh Tokens ---

export function storeRefreshToken(
  token: string,
  record: RefreshTokenRecord,
): void {
  store.refreshTokens[token] = record;
  saveStore();
}

export function getRefreshToken(
  token: string,
): RefreshTokenRecord | undefined {
  return store.refreshTokens[token];
}

export function deleteRefreshToken(token: string): void {
  delete store.refreshTokens[token];
  saveStore();
}

export { AUTH_CODE_TTL, ACCESS_TOKEN_TTL };
export type {
  AuthCodeRecord,
  AccessTokenRecord,
  RefreshTokenRecord,
  StoreData,
};
