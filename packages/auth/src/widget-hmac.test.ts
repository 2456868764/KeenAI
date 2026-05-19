import { describe, expect, it } from "vitest";
import { createWidgetUserHash, verifyWidgetUserHash } from "./widget-hmac.js";

describe("widget HMAC", () => {
  const secret = "test-widget-hmac-secret-32chars!!";

  it("creates stable hex digests", () => {
    const a = createWidgetUserHash(secret, "user-1");
    const b = createWidgetUserHash(secret, "user-1");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects wrong user or hash", () => {
    const hash = createWidgetUserHash(secret, "user-1");
    expect(verifyWidgetUserHash(secret, "user-1", hash)).toBe(true);
    expect(verifyWidgetUserHash(secret, "user-2", hash)).toBe(false);
    expect(verifyWidgetUserHash(secret, "user-1", "deadbeef")).toBe(false);
  });
});
