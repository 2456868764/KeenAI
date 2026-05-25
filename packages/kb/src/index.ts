export { createKeenaiKb } from "./client.js";
export {
  createHelpCenterStubConnector,
  createWebCrawlStubConnector,
  getKbStubConnector,
} from "./connectors/index.js";
export type {
  KbConnector,
  KbFetchedDocument,
  KbResourceRef,
  SyncKbSourceInput,
  SyncKbSourceResult,
} from "./connectors/types.js";
export { chunkKbDocument, type KbChunkDraft } from "./ingest/chunk-document.js";
export {
  embedKbChunkStub,
  KB_STUB_EMBED_DIMENSIONS,
  KB_STUB_EMBED_MODEL,
  stubEmbedKbChunk,
  type KbEmbeddedChunk,
} from "./ingest/embed-chunks-stub.js";
export {
  indexKbDocument,
  type IndexKbDocumentInput,
  type IndexKbDocumentResult,
} from "./ingest/index-document.js";
export {
  parseKbDocument,
  type ParsedKbDocument,
  type ParseKbDocumentInput,
} from "./ingest/parse-document.js";
export { listKbDocuments } from "./list-documents.js";
export { syncKbSource } from "./sync-source.js";
export type {
  KeenaiKb,
  KeenaiKbDeps,
  KbDocumentView,
  ListKbDocumentsInput,
} from "./types.js";
