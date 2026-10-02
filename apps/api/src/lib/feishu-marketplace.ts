import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

export type FeishuMarketplaceEvent = {
  payload: Record<string, unknown>;
  eventType?: string;
  eventId?: string;
  appId?: string;
  tenantKey?: string;
  appTicket?: string;
  status?: string;
  challenge?: string;
};

export function parseFeishuMarketplaceWebhook(input: {
  rawBody: string;
  headers: Record<string, string | undefined>;
  appId: string;
  verificationToken?: string;
  encryptKey?: string;
}): FeishuMarketplaceEvent {
  const wrapper = parseJsonObject(input.rawBody);
  if (input.encryptKey) {
    verifyFeishuSignature(wrapper, input.rawBody, input.headers, input.encryptKey);
  }
  const payload =
    typeof wrapper.encrypt === "string"
      ? parseJsonObject(decryptFeishuPayload(wrapper.encrypt, requiredEncryptKey(input.encryptKey)))
      : wrapper;
  verifyToken(payload, input.verificationToken);

  const header = record(payload.header);
  const event = record(payload.event);
  const eventType =
    stringValue(header?.event_type) ?? stringValue(event?.type) ?? stringValue(payload.type);
  const appId =
    stringValue(header?.app_id) ?? stringValue(event?.app_id) ?? stringValue(payload.app_id);
  if (appId && appId !== input.appId) throw new Error("feishu_app_id_mismatch");
  return {
    payload,
    eventType,
    eventId: stringValue(header?.event_id) ?? stringValue(event?.uuid) ?? stringValue(payload.uuid),
    appId: appId ?? input.appId,
    tenantKey:
      stringValue(header?.tenant_key) ??
      stringValue(event?.tenant_key) ??
      stringValue(payload.tenant_key),
    appTicket: stringValue(event?.app_ticket) ?? stringValue(payload.app_ticket),
    status: stringValue(event?.status) ?? stringValue(payload.status),
    challenge: stringValue(payload.challenge),
  };
}

export function decryptFeishuPayload(encrypted: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const encryptedBytes = Buffer.from(encrypted, "base64");
  if (encryptedBytes.byteLength <= 16) throw new Error("feishu_encrypted_payload_invalid");
  const decipher = createDecipheriv("aes-256-cbc", key, encryptedBytes.subarray(0, 16));
  return Buffer.concat([decipher.update(encryptedBytes.subarray(16)), decipher.final()]).toString(
    "utf8",
  );
}

function verifyFeishuSignature(
  body: Record<string, unknown>,
  rawBody: string,
  headers: Record<string, string | undefined>,
  encryptKey: string,
): void {
  const timestamp = headerValue(headers, "x-lark-request-timestamp");
  const nonce = headerValue(headers, "x-lark-request-nonce");
  const signature = headerValue(headers, "x-lark-signature");
  if (!timestamp || !nonce || !signature) throw new Error("feishu_signature_missing");
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1_000 - timestampSeconds) > 300) {
    throw new Error("feishu_signature_expired");
  }
  const candidates = new Set([rawBody, JSON.stringify(body)]);
  for (const serializedBody of candidates) {
    const expected = createHash("sha256")
      .update(`${timestamp}${nonce}${encryptKey}${serializedBody}`)
      .digest("hex");
    if (safeEqual(signature, expected)) return;
  }
  throw new Error("feishu_signature_invalid");
}

function verifyToken(payload: Record<string, unknown>, verificationToken?: string): void {
  if (!verificationToken) return;
  const header = record(payload.header);
  const event = record(payload.event);
  const token =
    stringValue(payload.token) ?? stringValue(header?.token) ?? stringValue(event?.token);
  if (!token || !safeEqual(token, verificationToken)) {
    throw new Error("feishu_verification_token_invalid");
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  const result = record(parsed);
  if (!result) throw new Error("feishu_payload_invalid");
  return result;
}

function requiredEncryptKey(value?: string): string {
  if (!value) throw new Error("feishu_encrypt_key_missing");
  return value;
}

function headerValue(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
