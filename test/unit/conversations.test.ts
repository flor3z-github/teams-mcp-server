import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// conversations.ts를 동적 import하여 각 테스트마다 fresh state 사용
describe("conversations", () => {
  let stateDir: string;
  let config: { stateDir: string };

  beforeEach(() => {
    stateDir = join(
      tmpdir(),
      `teams-conv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(stateDir, { recursive: true });
    config = { stateDir } as any;
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("should save and retrieve a conversation reference", async () => {
    const { saveRef, getRef } = await import("../../src/conversations.js");
    const ref = { conversation: { id: "conv-1" }, serviceUrl: "https://smba.trafficmanager.net" };
    saveRef(ref as any, config as any);

    const retrieved = getRef("conv-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.serviceUrl).toBe("https://smba.trafficmanager.net");
  });

  it("should track last active conversation", async () => {
    const { saveRef, getLastActiveConversation } = await import("../../src/conversations.js");
    saveRef({ conversation: { id: "conv-a" } } as any, config as any);
    saveRef({ conversation: { id: "conv-b" } } as any, config as any);

    expect(getLastActiveConversation()).toBe("conv-b");
  });

  it("should persist to disk", async () => {
    const { saveRef } = await import("../../src/conversations.js");
    saveRef({ conversation: { id: "conv-1" } } as any, config as any);

    expect(existsSync(join(stateDir, "conversations.json"))).toBe(true);
  });
});
