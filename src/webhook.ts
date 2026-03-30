import type { Config } from "./config.js";
import { loadAccess } from "./access.js";
import { chunk, MAX_CHUNK_LIMIT } from "./utils/chunk.js";

/**
 * 텍스트를 Adaptive Card 포맷으로 변환.
 * Power Automate Workflow webhook은 Adaptive Card를 공식 포맷으로 기대한다.
 */
function toAdaptiveCard(text: string): object {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text,
              wrap: true,
            },
          ],
        },
      },
    ],
  };
}

export async function sendToTeams(
  text: string,
  config: Config,
): Promise<number> {
  const access = loadAccess(config);
  const limit = Math.max(
    1,
    Math.min(access.textChunkLimit ?? MAX_CHUNK_LIMIT, MAX_CHUNK_LIMIT),
  );
  const mode = access.chunkMode ?? "newline";
  const chunks = chunk(text, limit, mode);

  for (let i = 0; i < chunks.length; i++) {
    const response = await fetch(config.incomingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toAdaptiveCard(chunks[i])),
    });

    if (!response.ok) {
      throw new Error(
        `chunk ${i + 1}/${chunks.length} failed: HTTP ${response.status}`,
      );
    }
  }

  return chunks.length;
}
