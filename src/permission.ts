import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import type { Config } from "./config.js";

export function setupPermissionRelay(mcp: McpServer, config: Config): void {
  mcp.setNotificationHandler(
    z.object({
      method: z.literal("notifications/claude/channel/permission_request"),
      params: z.object({
        request_id: z.string(),
        tool_name: z.string(),
        description: z.string(),
        input_preview: z.string(),
      }),
    }),
    async ({ params }) => {
      const { request_id, tool_name, description, input_preview } = params;

      const preview =
        tool_name === "Bash" ? `\`\`\`\n${input_preview}\n\`\`\`\n\n` : "\n";

      const text =
        `**Permission request** [${request_id}]\n\n` +
        `**${tool_name}**: ${description}\n` +
        preview +
        `@mention the bot and reply:\n` +
        `- \`yes ${request_id}\` to allow\n` +
        `- \`no ${request_id}\` to deny`;

      try {
        await fetch(config.incomingWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "message", text }),
        });
      } catch (err) {
        process.stderr.write(
          `teams channel: failed to send permission request: ${err}\n`,
        );
      }
    },
  );
}
