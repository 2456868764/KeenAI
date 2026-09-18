import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWeComPayload, parseWeComMessageXml, verifyWeComSignature } from "./wecom-crypto.js";

describe("WeCom callback crypto", () => {
  it("verifies, decrypts, and parses an official callback envelope", () => {
    const key = randomBytes(32);
    const config = {
      token: "callback-token",
      encodingAesKey: key.toString("base64").replace(/=$/, ""),
      corpId: "ww-corp-1",
    };
    const xml =
      "<xml><FromUserName><![CDATA[user-1]]></FromUserName><CreateTime>123</CreateTime>" +
      "<MsgType><![CDATA[text]]></MsgType><Content><![CDATA[hello]]></Content>" +
      "<MsgId>456</MsgId><AgentID>1001</AgentID></xml>";
    const random = randomBytes(16);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(Buffer.byteLength(xml));
    const raw = Buffer.concat([random, length, Buffer.from(xml), Buffer.from(config.corpId)]);
    const padding = 32 - (raw.byteLength % 32);
    const padded = Buffer.concat([raw, Buffer.alloc(padding, padding)]);
    const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = createHash("sha1")
      .update([config.token, timestamp, nonce, encrypted].sort().join(""))
      .digest("hex");

    expect(
      verifyWeComSignature({
        token: config.token,
        timestamp,
        nonce,
        encrypted,
        signature,
      }),
    ).toBe(true);
    expect(parseWeComMessageXml(decryptWeComPayload(encrypted, config))).toMatchObject({
      FromUserName: "user-1",
      MsgType: "text",
      Content: "hello",
      MsgId: "456",
      AgentID: "1001",
    });
  });
});
