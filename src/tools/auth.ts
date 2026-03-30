import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import {
  getAccount,
  acquireTokenDeviceCode,
  acquireTokenSilent,
} from "../graph/auth.js";

export const authTools: Tool[] = [
  {
    name: "auth_status",
    description:
      "Check current Microsoft Graph API authentication status. " +
      "Shows whether you are signed in and with which account.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "auth_login",
    description:
      "Sign in to Microsoft Graph API using device code flow. " +
      "No Azure app registration needed. " +
      "Returns a URL and code — open the URL in a browser and enter the code to authenticate.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

export const authHandlers: Record<
  string,
  (input: unknown, config: Config) => Promise<{ content: { type: string; text: string }[] }>
> = {
  auth_status: handleAuthStatus,
  auth_login: handleAuthLogin,
};

async function handleAuthStatus(
  _input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const account = await getAccount();
  const token = await acquireTokenSilent();

  if (account && token) {
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

  return {
    content: [
      {
        type: "text",
        text: "Not authenticated. Use auth_login to sign in.",
      },
    ],
  };
}

async function handleAuthLogin(
  _input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  let deviceCodeMessage = "";

  try {
    await acquireTokenDeviceCode((message) => {
      deviceCodeMessage = message;
    });

    const account = await getAccount();
    return {
      content: [
        {
          type: "text",
          text:
            `Successfully authenticated as: ${account?.name || account?.username}\n\n` +
            `You can now use Teams tools (list_teams, get_messages, send_message, etc.)`,
        },
      ],
    };
  } catch (err) {
    if (deviceCodeMessage) {
      return {
        content: [
          {
            type: "text",
            text:
              `${deviceCodeMessage}\n\n` +
              `After signing in, call auth_login again to complete authentication.`,
          },
        ],
      };
    }
    throw err;
  }
}
