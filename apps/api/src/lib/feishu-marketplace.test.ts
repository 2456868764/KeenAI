import { createCipheriv, createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFeishuMarketplaceWebhook } from "./feishu-marketplace.js";

afterEach(() => vi.restoreAllMocks());

describe("Feishu marketplace webhook", () => {
  it("verifies, decrypts, and normalizes an app ticket event", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const encryptKey = "encrypt-key";
    const payload = {
      event: {
        type: "app_ticket",
        app_id: "cli_app",
        app_ticket: "ticket-value",
        token: "verify-token",
        uuid: "event-1",
      },
    };
    const wrapper = { encrypt: encrypt(JSON.stringify(payload), encryptKey) };
    const rawBody = JSON.stringify(wrapper);
    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = createHash("sha256")
      .update(`${timestamp}${nonce}${encryptKey}${rawBody}`)
      .digest("hex");

    expect(
      parseFeishuMarketplaceWebhook({
        rawBody,
        headers: {
          "x-lark-request-timestamp": timestamp,
          "x-lark-request-nonce": nonce,
          "x-lark-signature": signature,
        },
        appId: "cli_app",
        verificationToken: "verify-token",
        encryptKey,
      }),
    ).toMatchObject({
      eventType: "app_ticket",
      eventId: "event-1",
      appId: "cli_app",
      appTicket: "ticket-value",
    });
  });

  it("rejects an invalid signature", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    expect(() =>
      parseFeishuMarketplaceWebhook({
        rawBody: JSON.stringify({ type: "url_verification", challenge: "challenge" }),
        headers: {
          "x-lark-request-timestamp": "1700000000",
          "x-lark-request-nonce": "nonce",
          "x-lark-signature": "invalid",
        },
        appId: "cli_app",
        encryptKey: "encrypt-key",
      }),
    ).toThrow("feishu_signature_invalid");
  });
});

function encrypt(value: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const iv = Buffer.alloc(16, 7);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final()]).toString("base64");
}
