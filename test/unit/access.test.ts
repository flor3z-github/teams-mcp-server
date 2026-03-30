import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadAccess,
  saveAccess,
  gate,
  assertAllowedChat,
  assertSendable,
} from "../../src/access.js";
import type { Config } from "../../src/config.js";
import type { Access } from "../../src/types.js";

function makeConfig(stateDir: string): Config {
  return {
    webhookSecret: "dGVzdA==",
    incomingWebhookUrl: "https://example.com/webhook",
    port: 8788,
    stateDir,
    logLevel: "error",
  };
}

describe("access", () => {
  let stateDir: string;
  let config: Config;

  beforeEach(() => {
    stateDir = join(tmpdir(), `teams-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(stateDir, { recursive: true });
    config = makeConfig(stateDir);
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  describe("loadAccess / saveAccess", () => {
    it("should return defaults when no file exists", () => {
      const access = loadAccess(config);
      expect(access.dmPolicy).toBe("allowlist");
      expect(access.allowFrom).toEqual([]);
    });

    it("should round-trip save and load", () => {
      const access: Access = {
        dmPolicy: "pairing",
        allowFrom: ["user-1"],
        channels: {},
        pending: {},
        textChunkLimit: 5000,
      };
      saveAccess(access, config);
      const loaded = loadAccess(config);
      expect(loaded.dmPolicy).toBe("pairing");
      expect(loaded.allowFrom).toEqual(["user-1"]);
      expect(loaded.textChunkLimit).toBe(5000);
    });

    it("should handle corrupt file gracefully", () => {
      const filePath = join(stateDir, "access.json");
      const { writeFileSync } = require("node:fs");
      writeFileSync(filePath, "not json{{{");
      const access = loadAccess(config);
      expect(access.dmPolicy).toBe("allowlist");
    });
  });

  describe("gate", () => {
    it("should allow known sender in allowlist mode", () => {
      const access: Access = {
        dmPolicy: "allowlist",
        allowFrom: ["known-user"],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      expect(gate("known-user", "Known", config)).toEqual({ action: "allow" });
    });

    it("should deny unknown sender in allowlist mode", () => {
      const access: Access = {
        dmPolicy: "allowlist",
        allowFrom: [],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      expect(gate("unknown", "Unknown", config)).toEqual({ action: "deny" });
    });

    it("should deny all in disabled mode", () => {
      const access: Access = {
        dmPolicy: "disabled",
        allowFrom: ["known-user"],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      expect(gate("known-user", "Known", config)).toEqual({ action: "deny" });
    });

    it("should generate pairing code for unknown sender in pairing mode", () => {
      const access: Access = {
        dmPolicy: "pairing",
        allowFrom: [],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      const result = gate("new-user", "New User", config);
      expect(result.action).toBe("pairing");
      if (result.action === "pairing") {
        expect(result.code).toHaveLength(6);
      }
    });

    it("should reuse existing pairing code for same sender", () => {
      const access: Access = {
        dmPolicy: "pairing",
        allowFrom: [],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      const r1 = gate("new-user", "New", config);
      const r2 = gate("new-user", "New", config);
      expect(r1.action).toBe("pairing");
      expect(r2.action).toBe("pairing");
      if (r1.action === "pairing" && r2.action === "pairing") {
        expect(r1.code).toBe(r2.code);
      }
    });

    it("should deny after max replies exceeded", () => {
      const access: Access = {
        dmPolicy: "pairing",
        allowFrom: [],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      gate("new-user", "New", config); // replies=1
      gate("new-user", "New", config); // replies=2
      const r3 = gate("new-user", "New", config); // replies=3 → deny
      expect(r3.action).toBe("deny");
    });

    it("should enforce max 3 pending limit", () => {
      const access: Access = {
        dmPolicy: "pairing",
        allowFrom: [],
        channels: {},
        pending: {},
      };
      saveAccess(access, config);
      gate("user-1", "U1", config);
      gate("user-2", "U2", config);
      gate("user-3", "U3", config);
      const r4 = gate("user-4", "U4", config);
      expect(r4.action).toBe("deny");
    });
  });

  describe("assertAllowedChat", () => {
    it("should not throw when no channels configured", () => {
      saveAccess({ dmPolicy: "allowlist", allowFrom: [], channels: {}, pending: {} }, config);
      expect(() => assertAllowedChat("any-chat", config)).not.toThrow();
    });

    it("should not throw for allowed channel", () => {
      saveAccess({
        dmPolicy: "allowlist",
        allowFrom: [],
        channels: { "ch-1": { requireMention: true, allowFrom: [] } },
        pending: {},
      }, config);
      expect(() => assertAllowedChat("ch-1", config)).not.toThrow();
    });

    it("should throw for disallowed channel", () => {
      saveAccess({
        dmPolicy: "allowlist",
        allowFrom: [],
        channels: { "ch-1": { requireMention: true, allowFrom: [] } },
        pending: {},
      }, config);
      expect(() => assertAllowedChat("ch-other", config)).toThrow("not allowlisted");
    });
  });

  describe("assertSendable", () => {
    it("should throw when text contains state dir path", () => {
      expect(() =>
        assertSendable(`file at ${stateDir}/secret.json`, config),
      ).toThrow("refusing to send");
    });

    it("should throw when text mentions access.json", () => {
      expect(() =>
        assertSendable('contents of access.json: {"dmPolicy":"open"}', config),
      ).toThrow("refusing to send");
    });

    it("should allow normal text", () => {
      expect(() => assertSendable("Hello from Claude!", config)).not.toThrow();
    });
  });
});
