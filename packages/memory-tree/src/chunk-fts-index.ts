import { extractBodyFromCanonicalMd } from "./canonical-body.js";
import type { PersistMemoryChunkResult } from "./types.js";

export type MemoryChunkFtsDoc = {
  id: string;
  orgId: string;
  brandId: string;
  body: string;
};

/** Optional FTS indexer injected at API bootstrap (LibSQL fts_memory_chunks). */
export type MemoryChunkFtsIndexer = {
  index(doc: MemoryChunkFtsDoc): Promise<void>;
};

export async function indexMemoryChunkInFts(
  indexer: MemoryChunkFtsIndexer | null | undefined,
  result: PersistMemoryChunkResult,
  input: { orgId: string; brandId: string; bodyMd: string },
): Promise<void> {
  if (!indexer || !result.created) return;

  await indexer.index({
    id: result.id,
    orgId: input.orgId,
    brandId: input.brandId,
    body: extractBodyFromCanonicalMd(input.bodyMd),
  });
}
