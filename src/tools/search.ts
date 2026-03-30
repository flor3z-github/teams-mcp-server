import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { validateInput } from "../utils/validators.js";
import * as graph from "../graph/client.js";

export const searchTools: Tool[] = [
  {
    name: "search_messages",
    description:
      "Search Teams messages using KQL (Keyword Query Language). " +
      'Examples: "project update", "from:john", "sent>2024-01-01".',
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "KQL search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_me",
    description: "Get the authenticated user's profile information.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_user",
    description: "Get a user's profile information by user ID or email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_id: {
          type: "string",
          description: "User ID or email address",
        },
      },
      required: ["user_id"],
    },
  },
];

const searchSchema = z.object({
  query: z.string().min(1, "query is required"),
});

const getUserSchema = z.object({
  user_id: z.string().min(1, "user_id is required"),
});

export const searchHandlers: Record<
  string,
  (input: unknown, config: Config) => Promise<{ content: { type: string; text: string }[] }>
> = {
  search_messages: handleSearchMessages,
  get_me: handleGetMe,
  get_user: handleGetUser,
};

async function handleSearchMessages(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const { query } = validateInput(searchSchema, input);
  const results = await graph.searchMessages(query);
  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
  };
}

async function handleGetMe(
  _input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const me = await graph.getMe();
  return {
    content: [{ type: "text", text: JSON.stringify(me, null, 2) }],
  };
}

async function handleGetUser(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const { user_id } = validateInput(getUserSchema, input);
  const user = await graph.getUser(user_id);
  return {
    content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
  };
}
