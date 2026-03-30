import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { assertAllowedChat, assertSendable } from "../access.js";
import { sendToTeams } from "../webhook.js";
import { validateInput } from "../utils/validators.js";

export const replyTool: Tool = {
  name: "reply",
  description:
    "Reply to a Teams channel message. " +
    "Use this tool to send a response back to the Teams channel. " +
    "Long messages are automatically chunked to fit Teams' 28KB limit.",
  inputSchema: {
    type: "object" as const,
    properties: {
      chat_id: {
        type: "string",
        description: "The conversation ID to reply to (from meta.chat_id)",
      },
      text: {
        type: "string",
        description: "The reply text to send (markdown supported)",
      },
    },
    required: ["text"],
  },
};

const replyInputSchema = z.object({
  chat_id: z.string().optional(),
  text: z.string().min(1, "text must not be empty"),
});

export async function handleReply(
  input: unknown,
  config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const { chat_id, text } = validateInput(replyInputSchema, input);

  if (chat_id) {
    assertAllowedChat(chat_id, config);
  }

  assertSendable(text, config);

  const sentCount = await sendToTeams(text, config);

  return {
    content: [
      {
        type: "text",
        text:
          sentCount === 1
            ? "Message sent to Teams."
            : `Message sent to Teams (${sentCount} chunks).`,
      },
    ],
  };
}
