import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

export type WeChatCryptoConfig = {
  token: string;
  encodingAesKey: string;
  appId: string;
};

export function verifyWeChatSignature(input: {
  token: string;
  timestamp: string;
  nonce: string;
  signature: string;
}): boolean {
  return safeSha1(input.signature, [input.token, input.timestamp, input.nonce]);
}

export function verifyWeChatMessageSignature(input: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  signature: string;
}): boolean {
  return safeSha1(input.signature, [input.token, input.timestamp, input.nonce, input.encrypted]);
}

export function decryptWeChatPayload(encrypted: string, config: WeChatCryptoConfig): string {
  const aesKey = Buffer.from(`${config.encodingAesKey}=`, "base64");
  if (aesKey.byteLength !== 32) throw new Error("wechat_encoding_aes_key_invalid");
  const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const plaintext = removePkcs7Padding(
    Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]),
  );
  if (plaintext.byteLength < 20) throw new Error("wechat_ciphertext_invalid");
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > plaintext.byteLength) throw new Error("wechat_ciphertext_invalid");
  const appId = plaintext.subarray(messageEnd).toString("utf8");
  if (appId !== config.appId) throw new Error("wechat_app_id_mismatch");
  return plaintext.subarray(20, messageEnd).toString("utf8");
}

export function readWeChatXmlTag(xml: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<${escapedTag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${escapedTag}>`,
    "i",
  ).exec(xml);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : decodeXmlEntities(value.trim());
}

export function parseWeChatMessageXml(xml: string): Record<string, string> {
  const fields = [
    "ToUserName",
    "FromUserName",
    "CreateTime",
    "MsgType",
    "Content",
    "bizmsgmenuid",
    "MsgId",
    "MsgDataId",
    "Idx",
    "MediaId",
    "PicUrl",
    "Format",
    "Recognition",
    "ThumbMediaId",
    "Location_X",
    "Location_Y",
    "Scale",
    "Label",
    "Title",
    "Description",
    "Url",
    "Event",
    "EventKey",
    "Ticket",
    "Encrypt",
  ];
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = readWeChatXmlTag(xml, field);
      return value === undefined ? [] : [[field, value]];
    }),
  );
}

function safeSha1(signature: string, values: string[]): boolean {
  const expected = createHash("sha1").update(values.sort().join("")).digest("hex");
  const provided = signature.toLowerCase();
  return (
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"))
  );
}

function removePkcs7Padding(value: Buffer): Buffer {
  const padding = value.at(-1) ?? 0;
  if (padding < 1 || padding > 32 || padding > value.byteLength) {
    throw new Error("wechat_padding_invalid");
  }
  for (let index = value.byteLength - padding; index < value.byteLength; index++) {
    if (value[index] !== padding) throw new Error("wechat_padding_invalid");
  }
  return value.subarray(0, value.byteLength - padding);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
