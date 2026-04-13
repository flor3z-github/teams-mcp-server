import {
  PublicClientApplication,
  type AuthenticationResult,
  type DeviceCodeRequest,
  type SilentFlowRequest,
  type AccountInfo,
} from "@azure/msal-node";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { sessionStore } from "../context.js";

// Microsoft Graph CLI — 모든 Azure AD 테넌트에 기본 등록된 first-party app
const CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";
const AUTHORITY = "https://login.microsoftonline.com/common";

const SCOPES = [
  "User.Read",
  "User.ReadBasic.All",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Chat.Read",
  "Chat.ReadWrite",
  "ChatMessage.Send",
  "TeamMember.Read.All",
];

let msalApp: PublicClientApplication | null = null;
let cacheDir: string = "";

function getCachePath(): string {
  return join(cacheDir, "graph-token-cache.json");
}

export function initAuth(stateDir: string): void {
  cacheDir = stateDir;
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });

  const beforeCacheAccess = async (cacheContext: { tokenCache: { deserialize: (data: string) => void } }) => {
    try {
      const data = readFileSync(getCachePath(), "utf8");
      cacheContext.tokenCache.deserialize(data);
    } catch {
      // ENOENT or corrupt — start with empty cache
    }
  };

  const afterCacheAccess = async (cacheContext: { cacheHasChanged: boolean; tokenCache: { serialize: () => string } }) => {
    if (cacheContext.cacheHasChanged) {
      const cachePath = getCachePath();
      const tmp = cachePath + ".tmp";
      writeFileSync(tmp, cacheContext.tokenCache.serialize(), { mode: 0o600 });
      renameSync(tmp, cachePath);
    }
  };

  msalApp = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
    },
    cache: {
      cachePlugin: {
        beforeCacheAccess,
        afterCacheAccess,
      },
    },
  });

  process.stderr.write("teams mcp: MSAL initialized\n");
}

/**
 * homeAccountId로 특정 계정을 조회한다.
 */
export async function getAccountById(
  homeAccountId: string,
): Promise<AccountInfo | null> {
  if (!msalApp) return null;
  const cache = msalApp.getTokenCache();
  const accounts = await cache.getAllAccounts();
  return accounts.find((a) => a.homeAccountId === homeAccountId) ?? null;
}

/**
 * 특정 계정의 Graph 토큰을 silent로 획득한다.
 */
export async function acquireTokenSilentForAccount(
  homeAccountId: string,
): Promise<string> {
  if (!msalApp) {
    throw new Error("Auth not initialized. Call initAuth() first.");
  }

  const account = await getAccountById(homeAccountId);
  if (!account) {
    throw new Error(
      `Account not found in MSAL cache: ${homeAccountId}. Re-authentication required.`,
    );
  }

  const request: SilentFlowRequest = {
    account,
    scopes: SCOPES,
  };

  const result = await msalApp.acquireTokenSilent(request);
  return result.accessToken;
}

/**
 * Device code flow를 수행한다.
 * 완료 시 AuthenticationResult를 반환한다 (homeAccountId 추출용).
 */
export async function acquireTokenDeviceCode(
  onDeviceCode: (message: string) => void,
): Promise<AuthenticationResult> {
  if (!msalApp) {
    throw new Error("Auth not initialized. Call initAuth() first.");
  }

  const request: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      onDeviceCode(response.message);
    },
  };

  const result = await msalApp.acquireTokenByDeviceCode(request);
  if (!result) {
    throw new Error("Device code authentication failed.");
  }
  return result;
}

/**
 * 현재 세션의 Graph 토큰을 획득한다.
 * sessionStore에서 msalAccountId를 읽어 해당 계정의 토큰을 반환한다.
 */
export async function getToken(): Promise<string> {
  const session = sessionStore.getStore();
  if (!session?.msalAccountId) {
    throw new Error(
      "Not authenticated. No session credentials found.",
    );
  }
  return acquireTokenSilentForAccount(session.msalAccountId);
}
