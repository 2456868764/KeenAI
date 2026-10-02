import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptWeChatPayload,
  parseWeChatMessageXml,
  verifyWeChatMessageSignature,
  verifyWeChatSignature,
} from "./wechat-crypto.js";

describe("WeChat Official Account callback crypto", () => {
  it("parses customer-service menu callback identifiers", () => {
    const xml =
      "<xml><ToUserName><![CDATA[gh_account]]></ToUserName>" +
      "<FromUserName><![CDATA[openid-1]]></FromUserName>" +
      "<MsgType><![CDATA[text]]></MsgType><Content><![CDATA[Sales]]></Content>" +
      "<bizmsgmenuid><![CDATA[sales]]></bizmsgmenuid><MsgId>456</MsgId></xml>";

    expect(parseWeChatMessageXml(xml)).toMatchObject({
      MsgType: "text",
      Content: "Sales",
      bizmsgmenuid: "sales",
    });
  });

  it("verifies plain server signatures", () => {
    const token = "callback-token";
    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = createHash("sha1")
      .update([token, timestamp, nonce].sort().join(""))
      .digest("hex");

    expect(verifyWeChatSignature({ token, timestamp, nonce, signature })).toBe(true);
    expect(verifyWeChatSignature({ token, timestamp, nonce, signature: "0".repeat(40) })).toBe(
      false,
    );
  });

  it("verifies, decrypts, and parses a safe-mode callback", () => {
    const key = randomBytes(32);
    const config = {
      token: "callback-token",
      encodingAesKey: key.toString("base64").replace(/=$/, ""),
      appId: "wx-app-1",
    };
    const xml =
      "<xml><ToUserName><![CDATA[gh_account]]></ToUserName>" +
      "<FromUserName><![CDATA[openid-1]]></FromUserName><CreateTime>123</CreateTime>" +
      "<MsgType><![CDATA[text]]></MsgType><Content><![CDATA[hello]]></Content>" +
      "<MsgId>456</MsgId></xml>";
    const random = randomBytes(16);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(Buffer.byteLength(xml));
    const raw = Buffer.concat([random, length, Buffer.from(xml), Buffer.from(config.appId)]);
    const padding = 32 - (raw.byteLength % 32);
    const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
      cipher.final(),
    ]).toString("base64");
    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = createHash("sha1")
      .update([config.token, timestamp, nonce, encrypted].sort().join(""))
      .digest("hex");

    expect(
      verifyWeChatMessageSignature({
        token: config.token,
        timestamp,
        nonce,
        encrypted,
        signature,
      }),
    ).toBe(true);
    expect(parseWeChatMessageXml(decryptWeChatPayload(encrypted, config))).toMatchObject({
      ToUserName: "gh_account",
      FromUserName: "openid-1",
      MsgType: "text",
      Content: "hello",
      MsgId: "456",
    });
  });
});
