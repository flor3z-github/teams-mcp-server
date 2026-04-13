import { describe, it, expect } from "vitest";
import { tools, toolHandlers } from "../../src/tools/index.js";

describe("tools/index", () => {
  it("모든 도구가 tools 배열에 포함됨", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("auth_status");
    expect(names).toContain("list_teams");
    expect(names).toContain("list_channels");
    expect(names).toContain("list_team_members");
    expect(names).toContain("get_messages");
    expect(names).toContain("send_message");
    expect(names).toContain("reply_to_message");
    expect(names).toContain("get_message_replies");
    expect(names).toContain("list_chats");
    expect(names).toContain("search_messages");
    expect(names).toContain("get_me");
    expect(names).toContain("get_user");
  });

  it("모든 도구에 대응하는 핸들러가 존재함", () => {
    for (const tool of tools) {
      expect(toolHandlers[tool.name]).toBeDefined();
      expect(typeof toolHandlers[tool.name]).toBe("function");
    }
  });

  it("핸들러에 도구 목록에 없는 항목이 없음", () => {
    const toolNames = new Set(tools.map((t) => t.name));
    for (const key of Object.keys(toolHandlers)) {
      expect(toolNames.has(key)).toBe(true);
    }
  });
});
