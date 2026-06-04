import type { FTSStore, KeenaiDb, VectorStore } from "@keenai/storage";
import { kbChunks, kbDocuments } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { stubEmbedKbChunk } from "./ingest/embed-chunks-stub.js";
import {
  KB_RRF_WEIGHTS_DEFAULT,
  type KbRetrievalSource,
  expandKbChunksFromGraph,
  fuseKbChunkRankings,
} from "./retriever/graph-expand.js";
import { hydrateKbSearchHits } from "./retriever/hydrate.js";
import {
  KB_RERANK_OUTPUT_TOP_K,
  KB_RERANK_RRF_TOP_K,
  type KbReranker,
  applyKbRerank,
} from "./retriever/rerank.js";

export type KbQueryEmbedder = {
  embed(text: string): Promise<number[]>;
};

export type SearchKbChunksInput = {
  orgId: string;
  brandId: string;
  q: string;
  limit?: number;
  chunkFts?: Pick<FTSStore, "search"> | null;
  chunkVector?: Pick<VectorStore, "query"> | null;
  queryEmbedder?: KbQueryEmbedder | null;
  /** When false, skip rerank even if `reranker` is set (KB-08). */
  rerank?: boolean;
  reranker?: KbReranker | null;
  rrfTopK?: number;
  rerankTopK?: number;
  /** When false, skip graph expansion (KB-09). Defaults to true. */
  graphExpand?: boolean;
  /** When false, skip hierarchical hydrate (KB-10). Defaults to true. */
  hydrate?: boolean;
  rrfWeights?: { fts: number; vector: number; graph: number };
};

export type KbSearchHit = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  contextPrefix: string | null;
  ftsScore: number | null;
  vectorScore: number | null;
  fusedScore: number;
  rerankScore?: number;
  sources: KbRetrievalSource[];
  snippet: string | null;
  /** KB-10: merged section text from siblings or parent chunk. */
  sectionSummary?: string | null;
  /** KB-10: `contextPrefix` + section summary (also copied into `contextPrefix` when hydrate runs). */
  hydratedContextPrefix?: string | null;
};

type KbSearchHitRow = KbSearchHit & {
  sectionId: string | null;
  parentChunkId: string | null;
  chunkIndex: number;
};

export type SearchKbChunksResult = {
  q: string;
  hits: KbSearchHit[];
};

export function createStubKbQueryEmbedder(): KbQueryEmbedder {
  return {
    async embed(text) {
      return stubEmbedKbChunk(text);
    },
  };
}

/** Hybrid FTS + vector retrieval for KB chunks with RRF fusion. */
export async function searchKbChunks(
  db: KeenaiDb,
  input: SearchKbChunksInput,
): Promise<SearchKbChunksResult> {
  const q = input.q.trim();
  const limit = input.limit ?? 10;
  if (!q) return { q, hits: [] };

  const rerankEnabled = input.rerank !== false && Boolean(input.reranker);
  const rrfTopK = input.rrfTopK ?? KB_RERANK_RRF_TOP_K;
  const rerankTopK = input.rerankTopK ?? KB_RERANK_OUTPUT_TOP_K;
  const fetchLimit = rerankEnabled
    ? Math.max(rrfTopK, limit)
    : Math.min(Math.max(limit * 10, limit), 100);
  const collectLimit = rerankEnabled ? rrfTopK : fetchLimit;
  const canHybrid = input.chunkFts && input.chunkVector && input.queryEmbedder;

  const ftsMap = new Map<string, { score: number; snippet?: string }>();
  const vectorMap = new Map<string, { score: number }>();
  const weights = input.rrfWeights ?? KB_RRF_WEIGHTS_DEFAULT;
  const graphExpand = input.graphExpand !== false;

  let fused: Array<{ id: string; score: number; sources: KbRetrievalSource[] }> = [];

  if (canHybrid) {
    const chunkFts = input.chunkFts;
    const chunkVector = input.chunkVector;
    const queryEmbedder = input.queryEmbedder;
    if (!chunkFts || !chunkVector || !queryEmbedder) {
      return { q, hits: [] };
    }

    const embedding = await queryEmbedder.embed(q);
    const [ftsHits, vectorHits] = await Promise.all([
      chunkFts.search({
        orgId: input.orgId,
        brandId: input.brandId,
        q,
        limit: fetchLimit,
      }),
      chunkVector.query({
        orgId: input.orgId,
        brandId: input.brandId,
        embedding,
        limit: fetchLimit,
      }),
    ]);

    for (const hit of ftsHits) ftsMap.set(hit.id, { score: hit.score, snippet: hit.snippet });
    for (const hit of vectorHits) vectorMap.set(hit.id, { score: hit.score });

    const graphHits = graphExpand
      ? (
          await expandKbChunksFromGraph(db, {
            orgId: input.orgId,
            brandId: input.brandId,
            q,
          })
        ).hits
      : [];

    fused = fuseKbChunkRankings(
      [
        {
          hits: ftsHits.map((hit) => ({ id: hit.id, score: hit.score })),
          source: "fts",
          weight: weights.fts,
        },
        {
          hits: vectorHits.map((hit) => ({ id: hit.id, score: hit.score })),
          source: "vector",
          weight: weights.vector,
        },
        { hits: graphHits, source: "graph", weight: weights.graph },
      ],
      { topK: fetchLimit },
    );
  } else if (input.chunkFts) {
    const ftsHits = await input.chunkFts.search({
      orgId: input.orgId,
      brandId: input.brandId,
      q,
      limit: fetchLimit,
    });
    for (const hit of ftsHits) ftsMap.set(hit.id, { score: hit.score, snippet: hit.snippet });
    fused = ftsHits.map((hit) => ({
      id: hit.id,
      score: hit.score,
      sources: ["fts"] as const,
    }));
  } else {
    return { q, hits: [] };
  }

  if (fused.length === 0) return { q, hits: [] };

  const orderedIds = fused.slice(0, fetchLimit).map((hit) => hit.id);
  const fusedMap = new Map(fused.map((hit) => [hit.id, hit]));

  const rows = await db
    .select({
      chunkId: kbChunks.id,
      documentId: kbChunks.documentId,
      sectionId: kbChunks.sectionId,
      parentChunkId: kbChunks.parentChunkId,
      chunkIndex: kbChunks.chunkIndex,
      content: kbChunks.content,
      contextPrefix: kbChunks.contextPrefix,
      documentTitle: kbDocuments.title,
    })
    .from(kbChunks)
    .innerJoin(kbDocuments, eq(kbChunks.documentId, kbDocuments.id))
    .where(
      and(
        eq(kbChunks.orgId, input.orgId),
        eq(kbChunks.brandId, input.brandId),
        inArray(kbChunks.id, orderedIds),
        eq(kbDocuments.status, "active"),
      ),
    );

  const rowMap = new Map(rows.map((row) => [row.chunkId, row]));
  const hits: KbSearchHitRow[] = [];

  for (const id of orderedIds) {
    if (hits.length >= collectLimit) break;
    const row = rowMap.get(id);
    const fusedHit = fusedMap.get(id);
    if (!row || !fusedHit) continue;

    const fts = ftsMap.get(id);
    const vector = vectorMap.get(id);

    hits.push({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      sectionId: row.sectionId,
      parentChunkId: row.parentChunkId,
      chunkIndex: row.chunkIndex,
      content: row.content,
      contextPrefix: row.contextPrefix,
      ftsScore: fts?.score ?? null,
      vectorScore: vector?.score ?? null,
      fusedScore: fusedHit.score,
      sources: fusedHit.sources,
      snippet: fts?.snippet ?? null,
    });
  }

  let ranked = hits;
  if (rerankEnabled && input.reranker && hits.length > 1) {
    ranked = (await applyKbRerank(q, hits, input.reranker, {
      rrfTopK,
      rerankTopK,
    })) as KbSearchHitRow[];
  }

  const hydrated = await hydrateKbSearchHits(db, ranked, {
    orgId: input.orgId,
    brandId: input.brandId,
    hydrate: input.hydrate,
  });

  return {
    q,
    hits: hydrated.slice(0, limit).map((hit) => ({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentTitle: hit.documentTitle,
      content: hit.content,
      contextPrefix: hit.contextPrefix,
      ftsScore: hit.ftsScore,
      vectorScore: hit.vectorScore,
      fusedScore: hit.fusedScore,
      rerankScore: hit.rerankScore,
      sources: hit.sources,
      snippet: hit.snippet,
      sectionSummary: hit.sectionSummary,
      hydratedContextPrefix: hit.hydratedContextPrefix,
    })),
  };
}
