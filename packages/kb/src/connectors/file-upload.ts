import { createHash } from "node:crypto";
import type { KbConnector, KbFetchedDocument, KbResourceRef } from "./types.js";

type FileConnectorDocument = {
  externalId?: unknown;
  title?: unknown;
  url?: unknown;
  rawContent?: unknown;
  contentType?: unknown;
  canonicalLocale?: unknown;
  updatedAt?: unknown;
};

export type FileUploadConnectorConfig = {
  documents?: FileConnectorDocument[];
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
    updatedAt,
  };
}

/** Config-backed file upload connector for release-ready local/imported file sources. */
export function createFileUploadConnector(config: FileUploadConnectorConfig = {}): KbConnector {
  const documents = (config.documents ?? [])
    .map((document, index) => normalizeDocument(document, index))
    .filter((document): document is KbFetchedDocument => !!document);
  const byExternalId = new Map(documents.map((document) => [document.externalId, document]));

  return {
    name: "file-upload",
    type: "file",
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
