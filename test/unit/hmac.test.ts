import { describe, it, expect } from "vitest";
import { verifyHmac } from "../../src/hmac.js";
import { createHmac, randomBytes } from "node:crypto";

function makeSignature(body: string, secret: string): string {
  const key = Buffer.from(secret, "base64");
  return createHmac("sha256", key).update(body, "utf8").digest("base64");
}

describe("verifyHmac", () => {
  const secret = randomBytes(32).toString("base64");
  const body = '{"type":"message","text":"hello"}';

  it("should accept a valid HMAC signature", () => {
    const sig = makeSignature(body, secret);
    expect(verifyHmac(body, `HMAC ${sig}`, secret)).toBe(true);
  });

  it("should reject an invalid signature", () => {
    expect(verifyHmac(body, "HMAC invalidbase64==", secret)).toBe(false);
  });

  it("should reject missing HMAC prefix", () => {
    const sig = makeSignature(body, secret);
    expect(verifyHmac(body, sig, secret)).toBe(false);
  });

  it("should reject empty auth header", () => {
    expect(verifyHmac(body, "", secret)).toBe(false);
  });

  it("should be case-insensitive for HMAC prefix", () => {
    const sig = makeSignature(body, secret);
    expect(verifyHmac(body, `hmac ${sig}`, secret)).toBe(true);
  });

  it("should reject when body is tampered", () => {
    const sig = makeSignature(body, secret);
    expect(verifyHmac(body + "x", `HMAC ${sig}`, secret)).toBe(false);
  });

  it("should reject when secret is wrong", () => {
    const sig = makeSignature(body, secret);
    const wrongSecret = randomBytes(32).toString("base64");
    expect(verifyHmac(body, `HMAC ${sig}`, wrongSecret)).toBe(false);
  });
});
