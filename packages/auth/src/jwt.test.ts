import { describe, expect, it } from "vitest";
import { parseTtlSeconds, signAccessToken, verifyAccessToken } from "./jwt.js";
import type { AuthConfig } from "./types.js";

const config: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

describe("jwt", () => {
  it("round-trips access token", async () => {
    const token = await signAccessToken(config, {
      sub: "acc_1",
      orgId: "org_1",
      memberId: "mem_1",
      role: "owner",
      brandIds: ["brand_1"],
      sessionId: "sess_1",
    });
    const claims = await verifyAccessToken(config, token);
    expect(claims.sub).toBe("acc_1");
    expect(claims.role).toBe("owner");
  });

  it("parses ttl strings", () => {
    expect(parseTtlSeconds("15m", 0)).toBe(900);
    expect(parseTtlSeconds("7d", 0)).toBe(604_800);
  });
});
