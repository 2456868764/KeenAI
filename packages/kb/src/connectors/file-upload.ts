import { createHash } from "node:crypto";
import type { KbSourceType } from "@keenai/storage/schema";
import { fileUploadConnectorConfigSchema } from "./schemas.js";
import type {
  KbConnector,
  KbDocumentAttachment,
  KbDocumentPermissions,
  KbFetchedDocument,
  KbResourceRef,
} from "./types.js";

type FileConnectorDocument = {
  externalId?: unknown;
  title?: unknown;
  url?: unknown;
  rawContent?: unknown;
  contentType?: unknown;
  canonicalLocale?: unknown;
  permissions?: unknown;
  attachments?: unknown;
  updatedAt?: unknown;
};

export type FileUploadConnectorConfig = {
  documents?: FileConnectorDocument[];
};

export type FileUploadConnectorOptions = {
  type?: Extract<KbSourceType, "file" | "file_upload">;
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

function normalizeDocument(doc: FileConnectorDocument, index: number): KbFetchedDocument | null {
  const rawContent = asString(doc.rawContent);
  if (!rawContent) return null;

  const externalId =
    asString(doc.externalId) ?? createHash("sha256").update(rawContent).digest("hex").slice(0, 24);
  const title = asString(doc.title) ?? `Uploaded document ${index + 1}`;
  const updatedAt = asString(doc.updatedAt) ?? new Date(0).toISOString();

  return {
    externalId,
    title,
    url: asString(doc.url),
    rawContent,
    contentType: asString(doc.contentType) ?? "text/markdown",
    canonicalLocale: asString(doc.canonicalLocale),
    permissions: normalizePermissions(doc.permissions),
    attachments: normalizeAttachments(doc.attachments),
    updatedAt,
  };
}

/** Config-backed file upload connector for release-ready local/imported file sources. */
export function createFileUploadConnector(
  config: FileUploadConnectorConfig = {},
  options: FileUploadConnectorOptions = {},
): KbConnector {
  const documents = (config.documents ?? [])
    .map((document, index) => normalizeDocument(document, index))
    .filter((document): document is KbFetchedDocument => !!document);
  const byExternalId = new Map(documents.map((document) => [document.externalId, document]));

  return {
    name: "file-upload",
    type: options.type ?? "file",
    configSchema() {
      return fileUploadConnectorConfigSchema;
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
      if (!document) throw new Error(`file_document_not_found:${ref.externalId}`);
      return document;
    },
    async healthCheck() {
      return documents.length > 0;
    },
  };
}

export type FileUploadConnector = ReturnType<typeof createFileUploadConnector>;
