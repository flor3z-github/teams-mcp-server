import {
  PublicClientApplication,
  type AuthenticationResult,
  type DeviceCodeRequest,
  type SilentFlowRequest,
  type AccountInfo,
} from "@azure/msal-node";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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
let cachedToken: AuthenticationResult | null = null;
let cacheDir: string = "";

function getCachePath(): string {
  return join(cacheDir, "graph-token-cache.json");
}

export function initAuth(stateDir: string): void {
  cacheDir = stateDir;

  const beforeCacheAccess = async (cacheContext: any) => {
    const cachePath = getCachePath();
    if (existsSync(cachePath)) {
      cacheContext.tokenCache.deserialize(readFileSync(cachePath, "utf8"));
    }
  };

  const afterCacheAccess = async (cacheContext: any) => {
    if (cacheContext.cacheHasChanged) {
      mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      writeFileSync(getCachePath(), cacheContext.tokenCache.serialize(), {
        mode: 0o600,
      });
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
}

export async function getAccount(): Promise<AccountInfo | null> {
  if (!msalApp) return null;
  const cache = msalApp.getTokenCache();
  const accounts = await cache.getAllAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

export async function acquireTokenSilent(): Promise<string | null> {
  if (!msalApp) return null;

  const account = await getAccount();
  if (!account) return null;

  try {
    const request: SilentFlowRequest = {
      account,
      scopes: SCOPES,
    };
    const result = await msalApp.acquireTokenSilent(request);
    cachedToken = result;
    return result.accessToken;
  } catch {
    return null;
  }
}

export async function acquireTokenDeviceCode(
  onDeviceCode: (message: string) => void,
): Promise<string> {
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
  cachedToken = result;
  return result.accessToken;
}

export async function getToken(): Promise<string> {
  const silent = await acquireTokenSilent();
  if (silent) return silent;
  throw new Error(
    "Not authenticated. Use the auth_login tool to sign in with your Microsoft account.",
  );
}

export function isAuthenticated(): boolean {
  return cachedToken !== null;
}
