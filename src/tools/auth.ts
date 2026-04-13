import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import { getAccountById } from "../graph/auth.js";
import { sessionStore } from "../context.js";

export const authTools: Tool[] = [
  {
    name: "auth_status",
    description:
      "Check current Microsoft Graph API authentication status. " +
      "Shows which Microsoft account is associated with this session.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "auth_login",
    description:
      "Authentication is handled via OAuth flow when connecting to this server. " +
      "This tool shows current authentication status.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

export const authHandlers: Record<
  string,
  (
    input: unknown,
    config: Config,
  ) => Promise<{ content: { type: string; text: string }[] }>
> = {
  auth_status: handleAuthStatus,
  auth_login: handleAuthLogin,
};

async function handleAuthStatus(
  _input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const session = sessionStore.getStore();
  if (!session?.msalAccountId) {
    return {
      content: [
        {
          type: "text",
          text: "Not authenticated. Reconnect to the server to trigger OAuth flow.",
        },
      ],
    };
  }

  const account = await getAccountById(session.msalAccountId);
  if (!account) {
    return {
      content: [
        {
          type: "text",
          text: `Session has account ID ${session.msalAccountId} but account not found in MSAL cache. Re-authentication may be required.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text:
          `Authenticated as: ${account.name || account.username}\n` +
          `Account: ${account.username}\n` +
          `Tenant: ${account.tenantId}`,
      },
    ],
  };
}

async function handleAuthLogin(
  _input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const session = sessionStore.getStore();
  if (!session?.msalAccountId) {
    return {
      content: [
        {
          type: "text",
          text: "Authentication is handled via OAuth flow when connecting. Reconnect to authenticate.",
        },
      ],
    };
  }

  const account = await getAccountById(session.msalAccountId);
  return {
    content: [
      {
        type: "text",
        text: `Already authenticated as: ${account?.name || account?.username || session.msalAccountId}`,
      },
    ],
  };
}
