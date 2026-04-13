import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../src/config.js";

vi.mock("../../src/graph/client.js", () => ({
  searchMessages: vi.fn(),
  getMe: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("../../src/graph/auth.js", () => ({
  getToken: vi.fn(),
}));

import { searchHandlers } from "../../src/tools/search.js";
import * as graph from "../../src/graph/client.js";

const mockSearchMessages = vi.mocked(graph.searchMessages);
const mockGetMe = vi.mocked(graph.getMe);
const mockGetUser = vi.mocked(graph.getUser);

const config: Config = { port: 3978, stateDir: "/tmp", logLevel: "info" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("search_messages", () => {
  it("검색 결과를 JSON으로 반환", async () => {
    mockSearchMessages.mockResolvedValue([{ summary: "found it" }]);
    const result = await searchHandlers.search_messages(
      { query: "test" },
      config,
    );
    expect(result.content[0].text).toContain("found it");
    expect(mockSearchMessages).toHaveBeenCalledWith("test");
  });

  it("query 누락 시 에러", async () => {
    await expect(
      searchHandlers.search_messages({}, config),
    ).rejects.toThrow();
  });
});

describe("get_me", () => {
  it("현재 사용자 프로필 반환", async () => {
    mockGetMe.mockResolvedValue({
      id: "u1",
      displayName: "Test User",
      mail: "test@example.com",
    });
    const result = await searchHandlers.get_me({}, config);
    expect(result.content[0].text).toContain("Test User");
    expect(mockGetMe).toHaveBeenCalledOnce();
  });
});

describe("get_user", () => {
  it("사용자 프로필 반환", async () => {
    mockGetUser.mockResolvedValue({
      id: "u2",
      displayName: "Other User",
    });
    const result = await searchHandlers.get_user(
      { user_id: "u2" },
      config,
    );
    expect(result.content[0].text).toContain("Other User");
    expect(mockGetUser).toHaveBeenCalledWith("u2");
  });

  it("user_id 누락 시 에러", async () => {
    await expect(
      searchHandlers.get_user({}, config),
    ).rejects.toThrow();
  });
});
