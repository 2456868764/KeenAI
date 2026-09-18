import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SEALED_KEY = "__keenai_sealed_v1";

export function sealChannelCredentials(
  credentials: Record<string, unknown>,
  secret: string,
): Record<string, unknown> {
  if (Object.keys(credentials).length === 0) return {};
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    [SEALED_KEY]: [iv, tag, ciphertext].map((part) => part.toString("base64url")).join("."),
  };
}

export function openChannelCredentials(
  credentials: Record<string, unknown>,
  secret: string,
): Record<string, unknown> {
  const sealed = credentials[SEALED_KEY];
  if (typeof sealed !== "string") return credentials;
  const [ivValue, tagValue, ciphertextValue] = sealed.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("invalid_channel_credentials");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const value = JSON.parse(plaintext) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_channel_credentials");
  }
  return value as Record<string, unknown>;
}

export function channelCredentialKeys(
  credentials: Record<string, unknown>,
  secret: string,
): string[] {
  return Object.keys(openChannelCredentials(credentials, secret)).sort();
}
