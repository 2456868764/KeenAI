export { createKeenaiKb } from "./client.js";
export {
  KEENI_KB_KB12,
  KB_QUERY_LOG_FEEDBACK,
  createKbQueryLog,
  kbHitLogScore,
  setKbQueryLogFeedback,
  type CreateKbQueryLogInput,
  type CreateKbQueryLogResult,
  type KbQueryLogFeedback,
  type KbQueryLogHitSnapshot,
  type SetKbQueryLogFeedbackInput,
} from "./query-log.js";
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
  chunkKbDocumentHierarchical,
  KEENI_KB_KB18_CHUNKER,
} from "./ingest/chunkers/hierarchical.js";
export {
  hashKbChunkContent,
  planKbDocumentDiffIndex,
  KEENI_KB_KB17,
  type KbDiffIndexPlan,
  type KbIndexedChunkSnapshot,
} from "./ingest/diff-index.js";
export { extractKbEntitiesFromDocument, KEENI_KB_KG05 } from "./ingest/extract-kb-entities.js";
export { parseKbMarkdownDocument, KEENI_KB_KB18_PARSER } from "./ingest/parsers/markdown.js";
export {
  KB_SOURCE_AUTHORITY,
  clampKbConfidence,
  computeKbChunkConfidence,
  resolveKbFeedbackScore,
  resolveKbSourceAuthority,
  type ComputeKbChunkConfidenceInput,
} from "./lifecycle/confidence.js";
export {
  getKbFreshnessHalfLifeDays,
  loadKbFreshnessConfig,
  parseKbFreshnessYaml,
  KEENI_KB_KB15,
  type KbFreshnessConfig,
} from "./lifecycle/freshness.js";
export {
  buildKbChunkProvenance,
  KEENI_KB_KB13,
  type BuildKbChunkProvenanceInput,
  type KbChunkProvenance,
} from "./lifecycle/provenance.js";
export {
  listKbDocumentSupersessionChain,
  supersedeKbDocument,
  KEENI_KB_KB14,
  type KbDocumentSupersessionLink,
  type SupersedeKbDocumentInput,
} from "./lifecycle/supersession.js";
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
  KEENI_KB_KB11,
  KB_DIVERSIFY_MAX_PER_SECTION,
  KB_DIVERSIFY_MAX_PER_SOURCE,
  KB_RECENCY_HALF_LIFE_DAYS,
  applyKbChunkConfidence,
  applyKbRecency,
  applyKbSearchPostFuse,
  diversifyKbSearchHits,
  kbHitRankingScore,
  kbRecencyBoost,
  resolveKbRecencyTimestamp,
  sortKbSearchHitsByRankingScore,
  type ApplyKbRecencyOptions,
  type ApplyKbSearchPostFuseOptions,
  type DiversifyKbHitsOptions,
  type KbDiversifiableHit,
  type KbRecencyAppliedFields,
  type KbRecencyHit,
  type KbRecencyScorableHit,
} from "./retriever/fuse.js";
export {
  KEENI_KB_KB10,
  KB_SECTION_SUMMARY_MAX_CHARS,
  buildKbSectionSummary,
  hydrateKbChunkContext,
  hydrateKbSearchHits,
  mergeKbHydratedContextPrefix,
  type HydrateKbSearchHitsInput,
  type HydratedKbChunkContext,
  type HydratedKbSearchHitFields,
  type KbChunkHydrateRow,
} from "./retriever/hydrate.js";
export {
  KEENI_KB_KB09,
  KB_GRAPH_EXPAND_LIMIT,
  KB_RRF_WEIGHTS_DEFAULT,
  expandKbChunksFromGraph,
  fuseKbChunkRankings,
  scoreKbEntityQueryMatch,
  tokenizeKbQuery,
  type ExpandKbGraphChunksInput,
  type ExpandKbGraphChunksResult,
  type KbFusedChunkHit,
  type KbRankedChunkHit,
  type KbRetrievalSource,
} from "./retriever/graph-expand.js";
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
export {
  KEENI_KB_KB19,
  KB_CRYSTALLIZE_MIN_CSAT,
  gateKbCrystallizeQuality,
  runKbCrystallization,
  scoreKbCrystallizeQuality,
  type KbCrystallizeExtract,
  type KbCrystallizeGate,
  type KbCrystallizeInput,
  type KbCrystallizeResult,
} from "./lifecycle/crystallize.js";
export {
  KEENI_KB_KB24,
  rankKbCrystallizeCandidates,
  type KbCrystallizeQueueItem,
  type RankKbCrystallizeCandidatesInput,
} from "./lifecycle/crystallize-priority.js";
export {
  KB_RECONCILE_OVERLAP_THRESHOLD,
  KEENI_KB_KB20,
  detectKbContradictions,
  proposeKbSupersession,
  type DetectKbContradictionsInput,
  type KbContradictionHit,
  type ProposeKbSupersessionInput,
} from "./lifecycle/reconcile.js";
export {
  KEENI_KB_KB21,
  parseKbBrandSchema,
  resolveKbQualityGates,
  type KbBrandKbSchema,
  type KbBrandQualityGates,
  type KbBrandRetrievalDefaults,
} from "./schema/brand-kb-schema.js";
export {
  KEENI_KB_KB23,
  KEENI_KB_SPRINT18,
  KEENI_KB_SPRINT18_EVAL,
  checkKbEvalThresholds,
  computeKbEvalMetrics,
  listKbGoldenQueries,
  loadKbEvalConfig,
  promoteKbQueryLogToGolden,
  runKbEvalSuite,
  runKbGoldenEval,
  scoreKbAnswerQuality,
  scoreKbAnswerQualityWithJudge,
  KEENI_KB_I102,
  type ComputeKbEvalMetricsInput,
  type KbEvalMetrics,
  type KbEvalSuiteReport,
  type KbGoldenEvalReport,
  type PromoteKbGoldenQueryInput,
  type RunKbGoldenEvalInput,
} from "./eval/index.js";
export type {
  KeenaiKb,
  KeenaiKbDeps,
  KbDocumentView,
  ListKbDocumentsInput,
} from "./types.js";
export type { KbCrystallizePayload, KbIngestPayload } from "./inngest/types.js";
