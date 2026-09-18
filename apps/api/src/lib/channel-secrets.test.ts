import { describe, expect, it } from "vitest";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";

describe("channel credential sealing", () => {
  it("round-trips credentials without storing plaintext", () => {
    const secret = "test-secret-at-least-32-characters-long!!";
    const credentials = { botToken: "token-123", port: 443 };
    const sealed = sealChannelCredentials(credentials, secret);
    expect(JSON.stringify(sealed)).not.toContain("token-123");
    expect(openChannelCredentials(sealed, secret)).toEqual(credentials);
  });
});
