import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleReply } from "../../src/tools/reply.js";
import type { Config } from "../../src/config.js";

// Mock webhook module
vi.mock("../../src/webhook.js", () => ({
  sendToTeams: vi.fn().mockResolvedValue(1),
}));

// Mock access module
vi.mock("../../src/access.js", () => ({
  assertAllowedChat: vi.fn(),
  assertSendable: vi.fn(),
  loadAccess: vi.fn().mockReturnValue({
    dmPolicy: "allowlist",
    allowFrom: [],
    channels: {},
    pending: {},
  }),
}));

const config: Config = {
  webhookSecret: "dGVzdA==",
  incomingWebhookUrl: "https://example.com/webhook",
  port: 8788,
  stateDir: "/tmp/teams-test",
  logLevel: "error",
};

describe("reply tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send a message and return success", async () => {
    const result = await handleReply({ text: "Hello Teams!" }, config);
    expect(result.content[0].text).toBe("Message sent to Teams.");
  });

  it("should report chunk count when message is split", async () => {
    const { sendToTeams } = await import("../../src/webhook.js");
    (sendToTeams as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);

    const result = await handleReply({ text: "Long message..." }, config);
    expect(result.content[0].text).toBe("Message sent to Teams (3 chunks).");
  });

  it("should reject empty text", async () => {
    await expect(handleReply({ text: "" }, config)).rejects.toThrow();
  });

  it("should reject missing text", async () => {
    await expect(handleReply({}, config)).rejects.toThrow();
  });

  it("should call assertAllowedChat when chat_id provided", async () => {
    const { assertAllowedChat } = await import("../../src/access.js");
    await handleReply({ text: "hello", chat_id: "conv-1" }, config);
    expect(assertAllowedChat).toHaveBeenCalledWith("conv-1", config);
  });

  it("should call assertSendable", async () => {
    const { assertSendable } = await import("../../src/access.js");
    await handleReply({ text: "safe message" }, config);
    expect(assertSendable).toHaveBeenCalledWith("safe message", config);
  });

  it("should propagate assertSendable errors", async () => {
    const { assertSendable } = await import("../../src/access.js");
    (assertSendable as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("refusing to send channel state file content");
    });

    await expect(
      handleReply({ text: "bad content" }, config),
    ).rejects.toThrow("refusing to send");
  });
});
