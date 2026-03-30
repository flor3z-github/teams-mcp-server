import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import { replyTool, handleReply } from "./reply.js";

export const tools: Tool[] = [replyTool];

export const toolHandlers: Record<
  string,
  (
    input: unknown,
    config: Config,
  ) => Promise<{ content: { type: string; text: string }[] }>
> = {
  reply: handleReply,
};
