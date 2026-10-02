import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptDingTalkPayload,
  encryptDingTalkResponse,
  verifyDingTalkSignature,
} from "./dingtalk-crypto.js";

describe("DingTalk callback crypto", () => {
  it("verifies and decrypts an encrypted suite callback", () => {
    const key = randomBytes(32);
    const config = {
      token: "callback-token",
      encodingAesKey: key.toString("base64").replace(/=$/, ""),
      suiteKey: "suite-key",
    };
    const payload = JSON.stringify({ EventType: "suite_ticket", SuiteTicket: "ticket-1" });
    const encrypted = encryptFixture(payload, key, config.suiteKey);
    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = createHash("sha1")
      .update([config.token, timestamp, nonce, encrypted].sort().join(""))
      .digest("hex");

    expect(
      verifyDingTalkSignature({ token: config.token, timestamp, nonce, encrypted, signature }),
    ).toBe(true);
    expect(decryptDingTalkPayload(encrypted, config)).toEqual({
      EventType: "suite_ticket",
      SuiteTicket: "ticket-1",
    });
  });

  it("encrypts a response that can be verified and decrypted", () => {
    const config = {
      token: "callback-token",
      encodingAesKey: randomBytes(32).toString("base64").replace(/=$/, ""),
      suiteKey: "suite-key",
    };
    const response = encryptDingTalkResponse("success", config, {
      timestamp: "1700000000",
      nonce: "nonce",
    });
    expect(
      verifyDingTalkSignature({
        token: config.token,
        timestamp: response.timeStamp,
        nonce: response.nonce,
        encrypted: response.encrypt,
        signature: response.msg_signature,
      }),
    ).toBe(true);
    const decrypted = decryptString(response.encrypt, config);
    expect(decrypted).toBe("success");
  });
});

function encryptFixture(message: string, key: Buffer, suiteKey: string): string {
  const messageBytes = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.byteLength);
  const raw = Buffer.concat([randomBytes(16), length, messageBytes, Buffer.from(suiteKey)]);
  const padding = 32 - (raw.byteLength % 32);
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
    cipher.final(),
  ]).toString("base64");
}

function decryptString(
  encrypted: string,
  config: { encodingAesKey: string; suiteKey: string },
): string {
  const key = Buffer.from(`${config.encodingAesKey}=`, "base64");
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const padded = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  const padding = padded.at(-1) ?? 0;
  const raw = padded.subarray(0, padded.byteLength - padding);
  const length = raw.readUInt32BE(16);
  expect(raw.subarray(20 + length).toString("utf8")).toBe(config.suiteKey);
  return raw.subarray(20, 20 + length).toString("utf8");
}
