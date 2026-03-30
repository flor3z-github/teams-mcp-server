import type { CloudAdapter, ConversationReference } from "botbuilder";
import type { Config } from "./config.js";
import { loadAccess } from "./access.js";
import { getRef, getLastActiveConversation } from "./conversations.js";
import { chunk, MAX_CHUNK_LIMIT } from "./utils/chunk.js";
import { markdownToHtml } from "./utils/markdown.js";

let adapter: CloudAdapter;
let appId: string;

export function setAdapter(a: CloudAdapter, id: string): void {
  adapter = a;
  appId = id;
}

export async function sendViaBot(
  conversationId: string,
  text: string,
  config: Config,
): Promise<number> {
  const ref = getRef(conversationId);
  if (!ref) {
    throw new Error(
      `No conversation reference for ${conversationId}. ` +
        `The user must send at least one message before the bot can reply.`,
    );
  }

  const access = loadAccess(config);
  const limit = Math.max(
    1,
    Math.min(access.textChunkLimit ?? MAX_CHUNK_LIMIT, MAX_CHUNK_LIMIT),
  );
  const mode = access.chunkMode ?? "newline";
  const chunks = chunk(text, limit, mode);

  for (const c of chunks) {
    await adapter.continueConversationAsync(
      appId,
      ref as ConversationReference,
      async (ctx) => {
        await ctx.sendActivity({
          type: "message",
          textFormat: "html",
          text: markdownToHtml(c),
        });
      },
    );
  }

  return chunks.length;
}

export { getLastActiveConversation };
