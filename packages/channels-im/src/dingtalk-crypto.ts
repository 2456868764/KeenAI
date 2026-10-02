import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type DingTalkCryptoConfig = {
  token: string;
  encodingAesKey: string;
  suiteKey: string;
};

export function verifyDingTalkSignature(input: {
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

export function decryptDingTalkPayload(
  encrypted: string,
  config: DingTalkCryptoConfig,
): Record<string, unknown> {
  const plaintext = decryptPayload(encrypted, config);
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("dingtalk_callback_payload_invalid");
  }
  return parsed as Record<string, unknown>;
}

export function encryptDingTalkResponse(
  message: string,
  config: DingTalkCryptoConfig,
  input: { timestamp: string; nonce: string },
) {
  const aesKey = decodeAesKey(config.encodingAesKey);
  const body = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.byteLength);
  const raw = Buffer.concat([randomBytes(16), length, body, Buffer.from(config.suiteKey, "utf8")]);
  const padding = 32 - (raw.byteLength % 32);
  const cipher = createCipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
    cipher.final(),
  ]).toString("base64");
  const signature = createHash("sha1")
    .update([config.token, input.timestamp, input.nonce, encrypted].sort().join(""))
    .digest("hex");
  return {
    msg_signature: signature,
    encrypt: encrypted,
    timeStamp: input.timestamp,
    nonce: input.nonce,
  };
}

function decryptPayload(encrypted: string, config: DingTalkCryptoConfig): string {
  const aesKey = decodeAesKey(config.encodingAesKey);
  const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const padded = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  const plaintext = removePkcs7Padding(padded);
  if (plaintext.byteLength < 20) throw new Error("dingtalk_ciphertext_invalid");
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > plaintext.byteLength) throw new Error("dingtalk_ciphertext_invalid");
  const suiteKey = plaintext.subarray(messageEnd).toString("utf8");
  if (suiteKey !== config.suiteKey) throw new Error("dingtalk_suite_key_mismatch");
  return plaintext.subarray(20, messageEnd).toString("utf8");
}

function decodeAesKey(value: string): Buffer {
  const key = Buffer.from(`${value}=`, "base64");
  if (key.byteLength !== 32) throw new Error("dingtalk_encoding_aes_key_invalid");
  return key;
}

function removePkcs7Padding(value: Buffer): Buffer {
  const padding = value.at(-1) ?? 0;
  if (padding < 1 || padding > 32 || padding > value.byteLength) {
    throw new Error("dingtalk_padding_invalid");
  }
  for (let index = value.byteLength - padding; index < value.byteLength; index++) {
    if (value[index] !== padding) throw new Error("dingtalk_padding_invalid");
  }
  return value.subarray(0, value.byteLength - padding);
}
