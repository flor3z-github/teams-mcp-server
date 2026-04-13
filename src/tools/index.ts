import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import { authTools, authHandlers } from "./auth.js";
import { teamsTools, teamsHandlers } from "./teams.js";
import { messageTools, messageHandlers } from "./messages.js";
import { searchTools, searchHandlers } from "./search.js";

// MCP 도구 목록
export const tools: Tool[] = [
  ...authTools,
  ...teamsTools,
  ...messageTools,
  ...searchTools,
];

// 도구명 → 핸들러 맵
export const toolHandlers: Record<
  string,
  (
    input: unknown,
    config: Config,
  ) => Promise<{ content: { type: string; text: string }[] }>
> = {
  ...authHandlers,
  ...teamsHandlers,
  ...messageHandlers,
  ...searchHandlers,
};
