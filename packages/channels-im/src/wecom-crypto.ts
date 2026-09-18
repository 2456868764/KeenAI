import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

export type WeComCryptoConfig = {
  token: string;
  encodingAesKey: string;
  corpId: string;
};

export function verifyWeComSignature(input: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  signature: string;
}): boolean {
  const expected = createHash("sha1")
    .update([input.token, input.timestamp, input.nonce, input.encrypted].sort().join(""))
    .digest("hex");
  const provided = input.signature.toLowerCase();
  return (
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"))
  );
}

export function decryptWeComPayload(encrypted: string, config: WeComCryptoConfig): string {
  const aesKey = Buffer.from(`${config.encodingAesKey}=`, "base64");
  if (aesKey.byteLength !== 32) throw new Error("wecom_encoding_aes_key_invalid");
  const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const padded = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  const plaintext = removePkcs7Padding(padded);
  if (plaintext.byteLength < 20) throw new Error("wecom_ciphertext_invalid");
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > plaintext.byteLength) throw new Error("wecom_ciphertext_invalid");
  const corpId = plaintext.subarray(messageEnd).toString("utf8");
  if (corpId !== config.corpId) throw new Error("wecom_corp_id_mismatch");
  return plaintext.subarray(20, messageEnd).toString("utf8");
}

export function readWeComXmlTag(xml: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<${escapedTag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${escapedTag}>`,
    "i",
  ).exec(xml);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : decodeXmlEntities(value.trim());
}

export function parseWeComMessageXml(xml: string): Record<string, string> {
  const fields = [
    "ToUserName",
    "FromUserName",
    "CreateTime",
    "MsgType",
    "Content",
    "MsgId",
    "AgentID",
    "ChatId",
  ];
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = readWeComXmlTag(xml, field);
      return value === undefined ? [] : [[field, value]];
    }),
  );
}

function removePkcs7Padding(value: Buffer): Buffer {
  const padding = value.at(-1) ?? 0;
  if (padding < 1 || padding > 32 || padding > value.byteLength) {
    throw new Error("wecom_padding_invalid");
  }
  for (let index = value.byteLength - padding; index < value.byteLength; index++) {
    if (value[index] !== padding) throw new Error("wecom_padding_invalid");
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
