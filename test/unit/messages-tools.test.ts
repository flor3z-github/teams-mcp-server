import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../src/config.js";

vi.mock("../../src/graph/client.js", () => ({
  getChannelMessages: vi.fn(),
  getChatMessages: vi.fn(),
  sendChannelMessage: vi.fn(),
  sendChatMessage: vi.fn(),
  replyToChannelMessage: vi.fn(),
  getChannelMessageReplies: vi.fn(),
  listChats: vi.fn(),
}));

vi.mock("../../src/graph/auth.js", () => ({
  getToken: vi.fn(),
}));

import { messageHandlers } from "../../src/tools/messages.js";
import * as graph from "../../src/graph/client.js";

const mockGetChannelMessages = vi.mocked(graph.getChannelMessages);
const mockGetChatMessages = vi.mocked(graph.getChatMessages);
const mockSendChannelMessage = vi.mocked(graph.sendChannelMessage);
const mockSendChatMessage = vi.mocked(graph.sendChatMessage);
const mockReplyToChannelMessage = vi.mocked(graph.replyToChannelMessage);
const mockGetChannelMessageReplies = vi.mocked(graph.getChannelMessageReplies);
const mockListChats = vi.mocked(graph.listChats);

const config: Config = { port: 3978, stateDir: "/tmp", logLevel: "info" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("get_messages", () => {
  it("채널 메시지 조회 (team_id + channel_id)", async () => {
    mockGetChannelMessages.mockResolvedValue([{ id: "m1" }]);
    const result = await messageHandlers.get_messages(
      { team_id: "t1", channel_id: "c1", top: 5 },
      config,
    );
    expect(result.content[0].text).toContain("m1");
    expect(mockGetChannelMessages).toHaveBeenCalledWith("t1", "c1", 5);
  });

  it("채팅 메시지 조회 (chat_id)", async () => {
    mockGetChatMessages.mockResolvedValue([{ id: "m2" }]);
    const result = await messageHandlers.get_messages(
      { chat_id: "chat1" },
      config,
    );
    expect(result.content[0].text).toContain("m2");
    expect(mockGetChatMessages).toHaveBeenCalledWith("chat1", undefined);
  });

  it("team_id와 chat_id 둘 다 없으면 에러", async () => {
    await expect(
      messageHandlers.get_messages({}, config),
    ).rejects.toThrow();
  });
});

describe("send_message", () => {
  it("채널에 메시지 전송", async () => {
    mockSendChannelMessage.mockResolvedValue({ id: "sent1" });
    const result = await messageHandlers.send_message(
      { team_id: "t1", channel_id: "c1", text: "hello" },
      config,
    );
    expect(result.content[0].text).toContain("Message sent");
    expect(mockSendChannelMessage).toHaveBeenCalledWith("t1", "c1", "hello");
  });

  it("채팅에 메시지 전송", async () => {
    mockSendChatMessage.mockResolvedValue({ id: "sent2" });
    const result = await messageHandlers.send_message(
      { chat_id: "chat1", text: "hi" },
      config,
    );
    expect(result.content[0].text).toContain("Message sent");
    expect(mockSendChatMessage).toHaveBeenCalledWith("chat1", "hi");
  });

  it("text 누락 시 에러", async () => {
    await expect(
      messageHandlers.send_message({ chat_id: "chat1" }, config),
    ).rejects.toThrow();
  });
});

describe("reply_to_message", () => {
  it("채널 메시지에 답글 전송", async () => {
    mockReplyToChannelMessage.mockResolvedValue({ id: "reply1" });
    const result = await messageHandlers.reply_to_message(
      { team_id: "t1", channel_id: "c1", message_id: "m1", text: "reply" },
      config,
    );
    expect(result.content[0].text).toContain("Reply sent");
    expect(mockReplyToChannelMessage).toHaveBeenCalledWith("t1", "c1", "m1", "reply");
  });

  it("필수 파라미터 누락 시 에러", async () => {
    await expect(
      messageHandlers.reply_to_message({ team_id: "t1" }, config),
    ).rejects.toThrow();
  });
});

describe("get_message_replies", () => {
  it("채널 메시지 답글 목록 조회", async () => {
    mockGetChannelMessageReplies.mockResolvedValue([
      { id: "r1", from: "User A", body: "reply text" },
    ]);
    const result = await messageHandlers.get_message_replies(
      { team_id: "t1", channel_id: "c1", message_id: "m1" },
      config,
    );
    expect(result.content[0].text).toContain("r1");
    expect(mockGetChannelMessageReplies).toHaveBeenCalledWith("t1", "c1", "m1", undefined);
  });

  it("top 파라미터 전달", async () => {
    mockGetChannelMessageReplies.mockResolvedValue([]);
    await messageHandlers.get_message_replies(
      { team_id: "t1", channel_id: "c1", message_id: "m1", top: 10 },
      config,
    );
    expect(mockGetChannelMessageReplies).toHaveBeenCalledWith("t1", "c1", "m1", 10);
  });
});

describe("list_chats", () => {
  it("채팅 목록 반환", async () => {
    mockListChats.mockResolvedValue([{ id: "chat1", topic: "Test" }]);
    const result = await messageHandlers.list_chats({}, config);
    expect(result.content[0].text).toContain("chat1");
    expect(mockListChats).toHaveBeenCalledWith(undefined);
  });

  it("top 파라미터 전달", async () => {
    mockListChats.mockResolvedValue([]);
    await messageHandlers.list_chats({ top: 5 }, config);
    expect(mockListChats).toHaveBeenCalledWith(5);
  });
});
