import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { validateInput } from "../utils/validators.js";
import * as graph from "../graph/client.js";

export const messageTools: Tool[] = [
  {
    name: "get_messages",
    description:
      "Get recent messages from a Teams channel or chat. " +
      "Provide either (team_id + channel_id) for channels, or chat_id for chats.",
    inputSchema: {
      type: "object" as const,
      properties: {
        team_id: {
          type: "string",
          description: "Team ID (for channel messages)",
        },
        channel_id: {
          type: "string",
          description: "Channel ID (for channel messages)",
        },
        chat_id: {
          type: "string",
          description: "Chat ID (for 1:1 or group chat messages)",
        },
        top: {
          type: "number",
          description: "Number of messages to retrieve (default: 10, max: 50)",
        },
      },
    },
  },
  {
    name: "send_message",
    description:
      "Send a message to a Teams channel or chat. " +
      "The message appears as from the authenticated user (not a bot). " +
      "Provide either (team_id + channel_id) for channels, or chat_id for chats.",
    inputSchema: {
      type: "object" as const,
      properties: {
        team_id: {
          type: "string",
          description: "Team ID (for channel messages)",
        },
        channel_id: {
          type: "string",
          description: "Channel ID (for channel messages)",
        },
        chat_id: {
          type: "string",
          description: "Chat ID (for 1:1 or group chat messages)",
        },
        text: {
          type: "string",
          description: "Message text (markdown supported)",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "list_chats",
    description:
      "List the authenticated user's recent chats (1:1 and group chats).",
    inputSchema: {
      type: "object" as const,
      properties: {
        top: {
          type: "number",
          description: "Number of chats to retrieve (default: 20)",
        },
      },
    },
  },
];

const getMessagesSchema = z
  .object({
    team_id: z.string().optional(),
    channel_id: z.string().optional(),
    chat_id: z.string().optional(),
    top: z.number().min(1).max(50).optional(),
  })
  .refine(
    (d) => (d.team_id && d.channel_id) || d.chat_id,
    "Provide either (team_id + channel_id) or chat_id",
  );

const sendMessageSchema = z
  .object({
    team_id: z.string().optional(),
    channel_id: z.string().optional(),
    chat_id: z.string().optional(),
    text: z.string().min(1, "text is required"),
  })
  .refine(
    (d) => (d.team_id && d.channel_id) || d.chat_id,
    "Provide either (team_id + channel_id) or chat_id",
  );

const listChatsSchema = z.object({
  top: z.number().min(1).max(50).optional(),
});

export const messageHandlers: Record<
  string,
  (input: unknown, config: Config) => Promise<{ content: { type: string; text: string }[] }>
> = {
  get_messages: handleGetMessages,
  send_message: handleSendMessage,
  list_chats: handleListChats,
};

async function handleGetMessages(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const params = validateInput(getMessagesSchema, input);

  let messages;
  if (params.chat_id) {
    messages = await graph.getChatMessages(params.chat_id, params.top);
  } else {
    messages = await graph.getChannelMessages(
      params.team_id!,
      params.channel_id!,
      params.top,
    );
  }

  return {
    content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
  };
}

async function handleSendMessage(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const params = validateInput(sendMessageSchema, input);

  let result;
  if (params.chat_id) {
    result = await graph.sendChatMessage(params.chat_id, params.text);
  } else {
    result = await graph.sendChannelMessage(
      params.team_id!,
      params.channel_id!,
      params.text,
    );
  }

  return {
    content: [
      { type: "text", text: `Message sent. ${JSON.stringify(result)}` },
    ],
  };
}

async function handleListChats(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const { top } = validateInput(listChatsSchema, input);
  const chats = await graph.listChats(top);
  return {
    content: [{ type: "text", text: JSON.stringify(chats, null, 2) }],
  };
}
