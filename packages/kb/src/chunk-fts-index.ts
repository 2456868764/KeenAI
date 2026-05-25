import type { FTSStore } from "@keenai/storage";

export type KbChunkFtsDoc = {
  chunkId: string;
  orgId: string;
  brandId: string;
  content: string;
  contextPrefix?: string | null;
};

export type KbChunkFtsIndexer = Pick<FTSStore, "index" | "deleteByIds">;

/** Index a KB chunk body into fts_kb_chunks. */
export async function indexKbChunkInFts(
  indexer: KbChunkFtsIndexer,
  doc: KbChunkFtsDoc,
): Promise<void> {
  await indexer.index({
    id: doc.chunkId,
    orgId: doc.orgId,
    brandId: doc.brandId,
    body: [doc.contextPrefix, doc.content].filter(Boolean).join("\n\n"),
  });
}
