export { createKeenaiKb } from "./client.js";
export {
  indexKbChunkInFts,
  type KbChunkFtsDoc,
  type KbChunkFtsIndexer,
} from "./chunk-fts-index.js";
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
  BGE_M3_DIMENSIONS,
  BGE_M3_MODEL_ID,
  createKbChunkEmbedder,
  createStubKbChunkEmbedder,
  createXenovaBgeM3KbEmbedder,
  embedKbChunk,
  resolveKbEmbedderProvider,
  type KbChunkEmbedder,
  type KbEmbedderProvider,
} from "./ingest/embedder.js";
export {
  createBgeM3KbQueryEmbedder,
  createKbQueryEmbedderFromChunkEmbedder,
} from "./embed-query.js";
export {
  BGE_RERANKER_MODEL_ID,
  KB_RERANK_OUTPUT_TOP_K,
  KB_RERANK_RRF_TOP_K,
  applyKbRerank,
  createKbReranker,
  createStubKbReranker,
  createXenovaBgeReranker,
  resolveKbRerankProvider,
  type KbRerankCandidate,
  type KbRerankProvider,
  type KbRerankScored,
  type KbReranker,
} from "./retriever/rerank.js";
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
export {
  createStubKbQueryEmbedder,
  searchKbChunks,
  type KbQueryEmbedder,
  type KbSearchHit,
  type SearchKbChunksInput,
  type SearchKbChunksResult,
} from "./search-kb-chunks.js";
export { syncKbSource } from "./sync-source.js";
export type {
  KeenaiKb,
  KeenaiKbDeps,
  KbDocumentView,
  ListKbDocumentsInput,
} from "./types.js";
