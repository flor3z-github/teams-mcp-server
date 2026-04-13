import { randomUUID, randomBytes } from "node:crypto";
import type { Response } from "express";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  getClient,
  registerClient,
  storeAuthCode,
  getAuthCode,
  deleteAuthCode,
  storeAccessToken,
  getAccessToken,
  deleteAccessToken,
  storeRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
} from "./store.js";
import {
  acquireTokenDeviceCode,
} from "../graph/auth.js";

// --- Device Code Flow state ---

interface DeviceFlow {
  deviceMessage: string | null;
  completed: boolean;
  error: string | null;
  msalAccountId: string | null;
}

const deviceFlows = new Map<string, DeviceFlow>();

// --- Authorize session (authorize → callback bridge) ---

interface AuthSession {
  clientId: string;
  params: AuthorizationParams;
}

const authSessions = new Map<string, AuthSession>();

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// --- Device Code Flow management ---

export function startDeviceFlow(): { flowId: string } {
  const flowId = randomUUID();
  const flow: DeviceFlow = {
    deviceMessage: null,
    completed: false,
    error: null,
    msalAccountId: null,
  };
  deviceFlows.set(flowId, flow);

  // 10분 후 자동 정리
  setTimeout(() => deviceFlows.delete(flowId), 10 * 60 * 1000);

  process.stderr.write(`teams mcp: device code flow started: ${flowId}\n`);

  acquireTokenDeviceCode((message) => {
    flow.deviceMessage = message;
  })
    .then((result) => {
      flow.completed = true;
      flow.msalAccountId = result.account?.homeAccountId ?? null;
      process.stderr.write(
        `teams mcp: device code flow completed: ${flowId} (account: ${result.account?.username ?? "unknown"})\n`,
      );
    })
    .catch((err) => {
      flow.error = String(err);
      process.stderr.write(
        `teams mcp: device code flow failed: ${flowId} - ${flow.error}\n`,
      );
    });

  return { flowId };
}

export function pollDeviceFlow(
  flowId: string,
): { deviceMessage: string | null; completed: boolean; error: string | null } | null {
  const flow = deviceFlows.get(flowId);
  if (!flow) return null;

  const result = {
    deviceMessage: flow.deviceMessage,
    completed: flow.completed,
    error: flow.error,
  };

  if (flow.completed || flow.error) {
    // completed/error 상태에서는 아직 삭제하지 않음 (callback에서 사용)
  }

  return result;
}

export function getDeviceFlowAccountId(flowId: string): string | null {
  const flow = deviceFlows.get(flowId);
  if (!flow?.completed || !flow.msalAccountId) return null;
  deviceFlows.delete(flowId);
  return flow.msalAccountId;
}

// --- OAuth Provider ---

export class TeamsOAuthProvider implements OAuthServerProvider {
  private port: number;

  constructor(port: number) {
    this.port = port;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId: string) => getClient(clientId),
      registerClient: (
        client: Omit<
          OAuthClientInformationFull,
          "client_id" | "client_id_issued_at"
        >,
      ) => registerClient(client),
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const authSessionToken = randomUUID();
    authSessions.set(authSessionToken, {
      clientId: client.client_id,
      params,
    });

    setTimeout(() => authSessions.delete(authSessionToken), 10 * 60 * 1000);

    process.stderr.write(
      `teams mcp: authorize session created: ${authSessionToken} (client: ${client.client_id})\n`,
    );

    const html = buildDeviceCodePage(
      params.redirectUri,
      params.state ?? "",
      authSessionToken,
      this.port,
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  /**
   * Device code flow 완료 후 callback 처리.
   * flowId와 authSessionToken으로 msalAccountId를 추출하고 auth code를 생성한다.
   */
  handleDeviceCallback(
    authSessionToken: string,
    flowId: string,
  ): { redirectUrl: string } | { error: string } {
    const session = authSessions.get(authSessionToken);
    if (!session) {
      return { error: "Invalid or expired auth session" };
    }

    const msalAccountId = getDeviceFlowAccountId(flowId);
    if (!msalAccountId) {
      return { error: "Device code flow not completed or already consumed" };
    }

    authSessions.delete(authSessionToken);

    const code = generateToken();
    storeAuthCode(code, {
      clientId: session.clientId,
      msalAccountId,
      codeChallenge: session.params.codeChallenge,
      redirectUri: session.params.redirectUri,
      scopes: session.params.scopes || [],
    });

    const redirectUrl = new URL(session.params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (session.params.state) {
      redirectUrl.searchParams.set("state", session.params.state);
    }

    process.stderr.write(
      `teams mcp: auth code issued for account: ${msalAccountId}\n`,
    );

    return { redirectUrl: redirectUrl.toString() };
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = getAuthCode(authorizationCode);
    if (!record) {
      throw new Error("Invalid or expired authorization code");
    }
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const record = getAuthCode(authorizationCode);
    if (!record) {
      throw new Error("Invalid or expired authorization code");
    }

    deleteAuthCode(authorizationCode);

    const accessToken = generateToken();
    const refreshToken = generateToken();

    storeAccessToken(accessToken, {
      clientId: record.clientId,
      msalAccountId: record.msalAccountId,
      scopes: record.scopes,
    });

    storeRefreshToken(refreshToken, {
      clientId: record.clientId,
      msalAccountId: record.msalAccountId,
      scopes: record.scopes,
    });

    process.stderr.write(
      `teams mcp: tokens issued for account: ${record.msalAccountId}\n`,
    );

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60,
      refresh_token: refreshToken,
      scope: record.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const record = getRefreshToken(refreshToken);
    if (!record) {
      throw new Error("Invalid refresh token");
    }

    const newAccessToken = generateToken();
    storeAccessToken(newAccessToken, {
      clientId: record.clientId,
      msalAccountId: record.msalAccountId,
      scopes: record.scopes,
    });

    const newRefreshToken = generateToken();
    storeRefreshToken(newRefreshToken, {
      clientId: record.clientId,
      msalAccountId: record.msalAccountId,
      scopes: record.scopes,
    });
    deleteRefreshToken(refreshToken);

    process.stderr.write(
      `teams mcp: tokens refreshed for account: ${record.msalAccountId}\n`,
    );

    return {
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60,
      refresh_token: newRefreshToken,
      scope: record.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = getAccessToken(token);
    if (!record) {
      throw new Error("Invalid or expired access token");
    }

    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      extra: {
        msalAccountId: record.msalAccountId,
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const { token, token_type_hint } = request;

    if (token_type_hint === "refresh_token") {
      deleteRefreshToken(token);
    } else if (token_type_hint === "access_token") {
      deleteAccessToken(token);
    } else {
      deleteAccessToken(token);
      deleteRefreshToken(token);
    }
  }
}

// --- Device Code HTML Page ---

function buildDeviceCodePage(
  redirectUri: string,
  state: string,
  authSessionToken: string,
  port: number,
): string {
  const safeRedirect = JSON.stringify(redirectUri);
  const safeState = JSON.stringify(state);
  const safeAuthSession = JSON.stringify(authSessionToken);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teams MCP — Sign in with Microsoft</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; justify-content: center; align-items: center;
         min-height: 100vh; background: #f5f5f5; color: #333; }
  .card { background: #fff; border-radius: 12px; padding: 48px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.1); max-width: 480px; width: 100%;
          text-align: center; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .subtitle { color: #666; margin-bottom: 32px; }
  .code-box { background: #f0f0f0; border-radius: 8px; padding: 20px;
              margin: 24px 0; font-size: 32px; font-weight: bold;
              letter-spacing: 4px; font-family: monospace; }
  .step { text-align: left; margin: 16px 0; padding: 12px 16px;
          background: #fafafa; border-radius: 8px; }
  .step-num { display: inline-block; width: 24px; height: 24px;
              background: #0078d4; color: #fff; border-radius: 50%;
              text-align: center; line-height: 24px; font-size: 13px;
              margin-right: 8px; }
  a { color: #0078d4; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  .spinner { display: inline-block; width: 16px; height: 16px;
             border: 2px solid #ccc; border-top-color: #0078d4;
             border-radius: 50%; animation: spin 0.8s linear infinite;
             vertical-align: middle; margin-right: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status { margin-top: 24px; color: #666; font-size: 14px; }
  .success { color: #107c10; font-weight: 600; }
  .error { color: #d13438; }
</style>
</head>
<body>
<div class="card">
  <h1>Teams MCP Server</h1>
  <p class="subtitle">Sign in with your Microsoft account</p>
  <div id="loading">Loading...</div>
  <div id="flow" style="display:none">
    <div class="step">
      <span class="step-num">1</span>
      Open <a id="ms-link" href="https://microsoft.com/devicelogin" target="_blank">microsoft.com/devicelogin</a>
    </div>
    <div class="code-box" id="code"></div>
    <div class="step">
      <span class="step-num">2</span>
      Enter the code above and sign in with your Microsoft account
    </div>
    <p class="status"><span class="spinner"></span> <span id="status-text">Waiting for sign-in...</span></p>
  </div>
</div>
<script>
(async () => {
  const redirectUri = ${safeRedirect};
  const state = ${safeState};
  const authSessionToken = ${safeAuthSession};
  const base = window.location.origin;

  const startRes = await fetch(base + "/oauth/device-start", { method: "POST" });
  const { flowId } = await startRes.json();
  if (!flowId) {
    document.getElementById("loading").innerHTML =
      '<p class="error">Failed to start device code flow.</p>';
    return;
  }

  let codeShown = false;

  const poll = async () => {
    try {
      const r = await fetch(base + "/oauth/device-poll?flow_id=" + flowId);
      const { deviceMessage, completed, error } = await r.json();

      if (deviceMessage && !codeShown) {
        codeShown = true;
        const codeMatch = deviceMessage.match(/enter the code ([A-Z0-9]+)/i);
        const urlMatch = deviceMessage.match(/(https:\\/\\/[^\\s]+)/);
        document.getElementById("loading").style.display = "none";
        document.getElementById("flow").style.display = "block";
        document.getElementById("code").textContent = codeMatch ? codeMatch[1] : "See below";
        if (urlMatch) document.getElementById("ms-link").href = urlMatch[1];
      }

      if (completed) {
        document.getElementById("status-text").className = "success";
        document.getElementById("status-text").textContent = "Authenticated! Redirecting...";

        const cbRes = await fetch(base + "/oauth/device-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authSessionToken, flowId }),
        });
        const cbData = await cbRes.json();
        if (cbData.redirectUrl) {
          setTimeout(() => { window.location.href = cbData.redirectUrl; }, 500);
        } else {
          document.getElementById("status-text").className = "error";
          document.getElementById("status-text").textContent = "Error: " + (cbData.error || "Unknown error");
        }
        return;
      }
      if (error) {
        document.getElementById("status-text").className = "error";
        document.getElementById("status-text").textContent = "Error: " + error;
        return;
      }
      setTimeout(poll, 2000);
    } catch { setTimeout(poll, 3000); }
  };
  poll();
})();
</script>
</body>
</html>`;
}
