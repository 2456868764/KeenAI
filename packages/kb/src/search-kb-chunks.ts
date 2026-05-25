import type { FTSStore, KeenaiDb, VectorStore } from "@keenai/storage";
import { rrfFuse } from "@keenai/storage";
import { kbChunks, kbDocuments } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { stubEmbedKbChunk } from "./ingest/embed-chunks-stub.js";

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
  sources: Array<"fts" | "vector">;
  snippet: string | null;
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

  const fetchLimit = Math.min(Math.max(limit * 10, limit), 100);
  const canHybrid = input.chunkFts && input.chunkVector && input.queryEmbedder;

  let fused: Array<{ id: string; score: number; sources: Array<"fts" | "vector"> }> = [];
  const ftsMap = new Map<string, { score: number; snippet?: string }>();
  const vectorMap = new Map<string, { score: number }>();

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

    fused = rrfFuse(
      [
        ftsHits.map((hit) => ({ id: hit.id, score: hit.score })),
        vectorHits.map((hit) => ({ id: hit.id, score: hit.score })),
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
    fused = ftsHits.map((hit) => ({ id: hit.id, score: hit.score, sources: ["fts"] as const }));
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
  const hits: KbSearchHit[] = [];

  for (const id of orderedIds) {
    if (hits.length >= limit) break;
    const row = rowMap.get(id);
    const fusedHit = fusedMap.get(id);
    if (!row || !fusedHit) continue;

    const fts = ftsMap.get(id);
    const vector = vectorMap.get(id);

    hits.push({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      content: row.content,
      contextPrefix: row.contextPrefix,
      ftsScore: fts?.score ?? null,
      vectorScore: vector?.score ?? null,
      fusedScore: fusedHit.score,
      sources: fusedHit.sources,
      snippet: fts?.snippet ?? null,
    });
  }

  return { q, hits };
}
