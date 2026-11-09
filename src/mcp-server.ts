import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { sessionStore } from "./context.js";
import { getSingleAccountId } from "./graph/auth.js";
import { tools, toolHandlers } from "./tools/index.js";
import { formatErrorResponse } from "./utils/errors.js";

/**
 * MCP Server 인스턴스 생성.
 * HTTP 모드에서는 세션마다 새 인스턴스가 생성된다.
 */
export async function createTeamsServer(config: Config): Promise<Server> {
  const mcp = new Server(
    { name: "teams", version: "0.3.0" },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      // stdio는 Bearer 토큰이 없으므로 MSAL 캐시의 단일 계정을 세션으로 주입한다.
      // HTTP는 http-server.ts가 Bearer 토큰 기준으로 주입하므로 여기서 대체하지 않는다.
      if (config.transport === "stdio") {
        const msalAccountId = await getSingleAccountId();
        return await sessionStore.run({ msalAccountId }, () =>
          handler(args, config),
        );
      }
      return await handler(args, config);
    } catch (error) {
      return {
        content: [{ type: "text", text: formatErrorResponse(error) }],
        isError: true,
      };
    }
  });

  return mcp;
}
