import { createHmac, timingSafeEqual } from "node:crypto";
import type { KbSourceType } from "@keenai/storage/schema";
import type { KbResourceRef } from "./connectors/types.js";

export const KEENI_KB_SOURCE_WEBHOOKS = {
  enabled: true,
  target: "kb.sources.webhook.verify_and_ingest",
  notes: "v0.2.0: verify source webhook events and normalize them into ingest triggers.",
} as const;

export type KbSourceWebhookProvider = Extract<KbSourceType, "github" | "notion">;

export type KbSourceWebhookAction = "ingest" | "ignored";

export type KbSourceWebhookResult = {
  provider: KbSourceWebhookProvider;
  action: KbSourceWebhookAction;
  eventType: string;
  eventId?: string;
  refs: KbResourceRef[];
  reason?: string;
};

export type HandleKbSourceWebhookInput = {
  provider: KbSourceWebhookProvider;
  headers: Headers | Record<string, string | undefined>;
  rawBody: string;
  config?: Record<string, unknown>;
  now?: () => Date;
};

export class KbSourceWebhookError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "KbSourceWebhookError";
    this.status = status;
    this.code = code;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function header(headers: HandleKbSourceWebhookInput["headers"], name: string): string | undefined {
  if (headers instanceof Headers) return asString(headers.get(name));
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return asString(value);
  }
  return undefined;
}

function parseJson(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new KbSourceWebhookError(400, "invalid_json");
  }
}

function webhookSecret(config: Record<string, unknown> | undefined): string | undefined {
  return (
    asString(config?.webhookSecret) ?? asString(config?.webhookToken) ?? asString(config?.secret)
  );
}

function verifyGitHubSignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature?.startsWith("sha256=")) {
    throw new KbSourceWebhookError(401, "github_signature_missing");
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new KbSourceWebhookError(401, "github_signature_invalid");
  }
}

function verifyToken(actual: string | undefined, expected: string, code: string) {
  if (!actual) throw new KbSourceWebhookError(401, `${code}_missing`);
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new KbSourceWebhookError(401, `${code}_invalid`);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function githubRefs(payload: Record<string, unknown>, updatedAt: string): KbResourceRef[] {
  const refs: KbResourceRef[] = [];
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  for (const commit of commits) {
    if (typeof commit !== "object" || commit === null) continue;
    const typed = commit as Record<string, unknown>;
    const timestamp = asString(typed.timestamp) ?? updatedAt;
    for (const path of [
      ...stringArray(typed.added),
      ...stringArray(typed.modified),
      ...stringArray(typed.removed),
    ]) {
      refs.push({ externalId: path, updatedAt: timestamp });
    }
  }

  const issue = payload.issue;
  if (typeof issue === "object" && issue !== null) {
    const typed = issue as Record<string, unknown>;
    const externalId = asString(typed.html_url) ?? asString(typed.url) ?? asString(typed.id);
    if (externalId) {
      refs.push({ externalId, updatedAt: asString(typed.updated_at) ?? updatedAt });
    }
  }

  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  for (const page of pages) {
    if (typeof page !== "object" || page === null) continue;
    const typed = page as Record<string, unknown>;
    const externalId = asString(typed.html_url) ?? asString(typed.page_name);
    if (externalId) refs.push({ externalId, updatedAt });
  }

  return refs;
}

function handleGitHubWebhook(input: HandleKbSourceWebhookInput): KbSourceWebhookResult {
  const secret = webhookSecret(input.config);
  if (!secret) throw new KbSourceWebhookError(401, "github_webhook_secret_missing");
  verifyGitHubSignature(input.rawBody, header(input.headers, "x-hub-signature-256"), secret);

  const eventType = header(input.headers, "x-github-event") ?? "unknown";
  const eventId = header(input.headers, "x-github-delivery");
  if (eventType === "ping") {
    return { provider: "github", action: "ignored", eventType, eventId, refs: [], reason: "ping" };
  }

  const payload = parseJson(input.rawBody);
  const updatedAt = input.now?.().toISOString() ?? new Date().toISOString();
  return {
    provider: "github",
    action: "ingest",
    eventType,
    eventId,
    refs: githubRefs(payload, updatedAt),
  };
}

function notionPageId(payload: Record<string, unknown>): string | undefined {
  const direct = asString(payload.page_id);
  if (direct) return direct;
  for (const key of ["entity", "page", "data"]) {
    const value = payload[key];
    if (typeof value === "object" && value !== null) {
      const id = asString((value as Record<string, unknown>).id);
      if (id) return id;
    }
  }
  return undefined;
}

function handleNotionWebhook(input: HandleKbSourceWebhookInput): KbSourceWebhookResult {
  const secret = webhookSecret(input.config);
  if (!secret) throw new KbSourceWebhookError(401, "notion_webhook_secret_missing");
  const token =
    header(input.headers, "x-notion-webhook-token") ??
    header(input.headers, "x-keenai-webhook-token") ??
    header(input.headers, "authorization")?.replace(/^Bearer\s+/i, "");
  verifyToken(token, secret, "notion_token");

  const payload = parseJson(input.rawBody);
  const eventType = asString(payload.type) ?? header(input.headers, "x-notion-event") ?? "unknown";
  const eventId = asString(payload.id) ?? header(input.headers, "x-notion-delivery");
  const pageId = notionPageId(payload);
  const updatedAt =
    asString(payload.updated_at) ?? input.now?.().toISOString() ?? new Date().toISOString();

  return {
    provider: "notion",
    action: "ingest",
    eventType,
    eventId,
    refs: pageId ? [{ externalId: pageId, updatedAt }] : [],
  };
}

export function handleKbSourceWebhook(input: HandleKbSourceWebhookInput): KbSourceWebhookResult {
  if (input.provider === "github") return handleGitHubWebhook(input);
  if (input.provider === "notion") return handleNotionWebhook(input);
  throw new KbSourceWebhookError(400, "unsupported_kb_webhook_provider");
}
