import { createHash } from "node:crypto";
import type { KbSourceType } from "@keenai/storage/schema";
import { configDocumentsConnectorConfigSchema } from "./schemas.js";
import type {
  KbConnector,
  KbDocumentAttachment,
  KbDocumentPermissions,
  KbFetchedDocument,
  KbResourceRef,
} from "./types.js";

export type ConfigSourceDocument = {
  externalId?: unknown;
  title?: unknown;
  url?: unknown;
  rawContent?: unknown;
  content?: unknown;
  body?: unknown;
  text?: unknown;
  transcript?: unknown;
  contentType?: unknown;
  canonicalLocale?: unknown;
  permissions?: unknown;
  attachments?: unknown;
  updatedAt?: unknown;
};

export type ConfigDocumentsConnectorConfig = {
  documents?: ConfigSourceDocument[];
  items?: ConfigSourceDocument[];
  defaultContentType?: unknown;
};

export type CreateConfigDocumentsConnectorInput = {
  type: KbSourceType;
  name: string;
  titlePrefix: string;
  config?: ConfigDocumentsConnectorConfig;
  defaultContentType?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePermissions(value: unknown): KbDocumentPermissions | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as { visibility?: unknown; roles?: unknown };
  if (
    raw.visibility !== "public" &&
    raw.visibility !== "customers" &&
    raw.visibility !== "paying_customers" &&
    raw.visibility !== "internal" &&
    raw.visibility !== "role"
  ) {
    return undefined;
  }
  return {
    visibility: raw.visibility,
    roles: Array.isArray(raw.roles)
      ? raw.roles.filter((role): role is string => typeof role === "string")
      : undefined,
  };
}

function normalizeAttachments(value: unknown): KbDocumentAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value
    .map((attachment) => {
      if (typeof attachment !== "object" || attachment === null) return null;
      const raw = attachment as Record<string, unknown>;
      const filename = asString(raw.filename);
      const mime = asString(raw.mime);
      const url = asString(raw.url);
      const bytes = typeof raw.bytes === "number" && Number.isFinite(raw.bytes) ? raw.bytes : null;
      if (!filename || !mime || !url || bytes === null || bytes < 0) return null;
      return { filename, mime, url, bytes };
    })
    .filter((attachment): attachment is KbDocumentAttachment => !!attachment);
  return attachments.length > 0 ? attachments : undefined;
}

function normalizeDocument(
  doc: ConfigSourceDocument,
  index: number,
  input: CreateConfigDocumentsConnectorInput,
  now: Date,
): KbFetchedDocument | null {
  const rawContent =
    asString(doc.rawContent) ??
    asString(doc.content) ??
    asString(doc.body) ??
    asString(doc.text) ??
    asString(doc.transcript);
  if (!rawContent) return null;

  const externalId =
    asString(doc.externalId) ??
    `${input.type}:${createHash("sha256").update(rawContent).digest("hex").slice(0, 24)}`;

  return {
    externalId,
    title: asString(doc.title) ?? `${input.titlePrefix} ${index + 1}`,
    url: asString(doc.url),
    rawContent,
    contentType:
      asString(doc.contentType) ??
      asString(input.config?.defaultContentType) ??
      input.defaultContentType ??
      "text/markdown",
    canonicalLocale: asString(doc.canonicalLocale),
    permissions: normalizePermissions(doc.permissions),
    attachments: normalizeAttachments(doc.attachments),
    updatedAt: asString(doc.updatedAt) ?? now.toISOString(),
  };
}

/** Config-backed connector for internal/product/external source snapshots. */
export function createConfigDocumentsConnector(
  input: CreateConfigDocumentsConnectorInput,
): KbConnector {
  const now = new Date();
  const rawDocuments = [...(input.config?.documents ?? []), ...(input.config?.items ?? [])];
  const documents = rawDocuments
    .map((document, index) => normalizeDocument(document, index, input, now))
    .filter((document): document is KbFetchedDocument => !!document);
  const byExternalId = new Map(documents.map((document) => [document.externalId, document]));

  return {
    name: input.name,
    type: input.type,
    configSchema() {
      return configDocumentsConnectorConfigSchema;
    },
    async list(opts) {
      const refs: KbResourceRef[] = documents.map((document) => ({
        externalId: document.externalId,
        updatedAt: document.updatedAt,
        etag: createHash("sha256").update(document.rawContent).digest("hex").slice(0, 16),
      }));
      if (!opts.since) return refs;
      const since = opts.since;
      return refs.filter((ref) => new Date(ref.updatedAt) >= since);
    },
    async fetch(ref) {
      const document = byExternalId.get(ref.externalId);
      if (!document) throw new Error(`${input.name}_document_not_found:${ref.externalId}`);
      return document;
    },
    async healthCheck() {
      return documents.length > 0;
    },
  };
}
