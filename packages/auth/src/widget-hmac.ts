import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 hex digest for widget Identity Verification (Intercom-style). */
export function createWidgetUserHash(secret: string, userId: string): string {
  return createHmac("sha256", secret).update(userId, "utf8").digest("hex");
}

export function verifyWidgetUserHash(secret: string, userId: string, userHash: string): boolean {
  if (!userId || !userHash) return false;
  const expected = createWidgetUserHash(secret, userId);
  if (expected.length !== userHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(userHash, "hex"));
  } catch {
    return false;
  }
}
