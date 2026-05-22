import type { KeenaiDb } from "@keenai/storage";
import { memoryChunks } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";

export type ExtractChunkResult = {
  processed: boolean;
  chunkId: string;
};

/** Stub deep-score job (MT-02): marks admitted chunks as extract-processed. */
export async function extractChunk(db: KeenaiDb, chunkId: string): Promise<ExtractChunkResult> {
  const [chunk] = await db.select().from(memoryChunks).where(eq(memoryChunks.id, chunkId)).limit(1);

  if (!chunk || chunk.lifecycle !== "admitted") {
    return { processed: false, chunkId };
  }

  await db
    .update(memoryChunks)
    .set({
      metadata: {
        ...chunk.metadata,
        extractChunkStatus: "stub",
        extractChunkAt: new Date().toISOString(),
      },
    })
    .where(eq(memoryChunks.id, chunkId));

  return { processed: true, chunkId };
}
