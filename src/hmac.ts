import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHmac(
  body: string,
  authHeader: string,
  secret: string,
): boolean {
  const match = authHeader.match(/^HMAC\s+(.+)$/i);
  if (!match) return false;

  const providedSignature = match[1];

  const key = Buffer.from(secret, "base64");
  const expectedSignature = createHmac("sha256", key)
    .update(body, "utf8")
    .digest("base64");

  const a = Buffer.from(providedSignature, "utf8");
  const b = Buffer.from(expectedSignature, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
