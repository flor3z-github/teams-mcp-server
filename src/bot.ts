import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TeamsActivityHandler,
  TurnContext,
  type ConversationReference,
} from "botbuilder";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "./config.js";
import { gate } from "./access.js";
import { saveRef } from "./conversations.js";
import { htmlToMarkdown } from "./utils/markdown.js";
import type { ChannelMeta } from "./types.js";

const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i;

export function createBotAdapter(config: Config): CloudAdapter {
  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.appId,
    MicrosoftAppPassword: config.appPassword,
    MicrosoftAppTenantId: config.tenantId,
    MicrosoftAppType: config.appType,
  });

  const adapter = new CloudAdapter(auth);

  adapter.onTurnError = async (_context, error) => {
    process.stderr.write(`teams chat: bot turn error: ${error}\n`);
  };

  return adapter;
}

export function createBotHandler(mcp: McpServer, config: Config) {
  return new (class extends TeamsActivityHandler {
    async onMessage(context: TurnContext): Promise<void> {
      // 1. @멘션 제거 (그룹 채팅/채널)
      TurnContext.removeRecipientMention(context.activity);

      // 2. 텍스트 추출 — HTML이면 Markdown으로 변환
      let text = (context.activity.text || "").trim();
      if (context.activity.textFormat === "html" && text) {
        text = htmlToMarkdown(text);
      }

      const senderId = context.activity.from.aadObjectId || "";
      const senderName = context.activity.from.name || "";

      // 3. ConversationReference 저장 (proactive messaging용)
      const ref = TurnContext.getConversationReference(
        context.activity,
      ) as Partial<ConversationReference>;
      saveRef(ref, config);

      // 4. Permission reply 인터셉트
      const permMatch = PERMISSION_REPLY_RE.exec(text);
      if (permMatch) {
        const approved = permMatch[1]!.toLowerCase().startsWith("y");
        await mcp.notification({
          method: "notifications/claude/channel/permission",
          params: {
            request_id: permMatch[2]!.toLowerCase(),
            behavior: approved ? "allow" : "deny",
          },
        });
        await context.sendActivity(approved ? "Allowed." : "Denied.");
        return;
      }

      // 5. Access gate
      const gateResult = gate(senderId, senderName, config);

      if (gateResult.action === "pairing") {
        await context.sendActivity(
          `Pairing required.\n` +
            `Run in Claude Code terminal:\n` +
            `/teams:access pair ${gateResult.code}`,
        );
        return;
      }
      if (gateResult.action === "deny") {
        return;
      }

      // 6. Typing indicator
      await context.sendActivity({ type: "typing" });

      // 7. MCP notification
      const meta: ChannelMeta = {
        chat_id: context.activity.conversation.id,
        message_id: context.activity.id || "",
        user: senderName,
        user_id: senderId,
        ts: new Date().toISOString(),
      };

      await mcp.notification({
        method: "notifications/claude/channel",
        params: {
          content: text,
          meta,
        },
      });
    }
  })();
}
