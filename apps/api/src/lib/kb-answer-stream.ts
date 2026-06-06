import {
  type KbSearchHit,
  createBgeM3KbQueryEmbedder,
  createKbQueryLog,
  searchKbChunks,
} from "@keenai/kb";
import { type KbAnswerContextChunk, streamKbAnswerFromProvider } from "@keenai/llm";
import type { parseApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { getKbChunkFtsStore } from "./kb-chunk-fts-init.js";
import { getKbChunkVectorStore } from "./kb-chunk-vector-init.js";
import { getKbReranker } from "./kb-search-config.js";
import { createApiLlmRegistry } from "./llm-registry.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export type KbAnswerCitation = {
  chunkId: string;
  documentTitle: string;
};

function toContextChunks(hits: KbSearchHit[]): KbAnswerContextChunk[] {
  return hits.map((hit) => ({
    chunkId: hit.chunkId,
    documentTitle: hit.documentTitle,
    content: hit.snippet ?? hit.content,
    contextPrefix: hit.hydratedContextPrefix ?? hit.contextPrefix,
  }));
}

function toCitations(hits: KbSearchHit[]): KbAnswerCitation[] {
  return hits.slice(0, 3).map((hit) => ({
    chunkId: hit.chunkId,
    documentTitle: hit.documentTitle,
  }));
}

export async function preparePublicKbAnswerStream(
  db: Db,
  env: ReturnType<typeof parseApiEnv>,
  input: { orgId: string; brandId: string; q: string; limit: number; rerank: boolean },
) {
  const chunkFts = getKbChunkFtsStore();
  if (!chunkFts) {
    return { error: "kb_fts_unavailable" as const };
  }

  const startedAt = performance.now();
  const results = await searchKbChunks(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    q: input.q,
    limit: input.limit,
    chunkFts,
    chunkVector: getKbChunkVectorStore(),
    queryEmbedder: createBgeM3KbQueryEmbedder(),
    rerank: input.rerank,
    reranker: input.rerank ? getKbReranker() : null,
  });
  const latencyMs = performance.now() - startedAt;

  const log = await createKbQueryLog(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    queryText: input.q,
    hits: results.hits,
    latencyMs,
  });

  const chunks = toContextChunks(results.hits);
  const citations = toCitations(results.hits);
  const llm = createApiLlmRegistry(env);
  const provider = llm.resolveDraftProvider();
  const stream = streamKbAnswerFromProvider(provider, { query: input.q, chunks });

  return {
    logId: log.id,
    providerId: provider.id,
    citations,
    stream,
  };
}
