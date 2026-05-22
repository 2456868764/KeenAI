import type { KeenaiDb } from "@keenai/storage";
import { memoryChunks } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { type FastScoreInput, type FastScoreResult, computeFastScore } from "./fast-score.js";

export type ApplyFastScoreInput = FastScoreInput & {
  chunkId: string;
};

/** Score a chunk and persist lifecycle + fastScore. */
export async function applyFastScoreToChunk(
  db: KeenaiDb,
  input: ApplyFastScoreInput,
): Promise<FastScoreResult> {
  const result = computeFastScore(input);

  const [existing] = await db
    .select()
    .from(memoryChunks)
    .where(eq(memoryChunks.id, input.chunkId))
    .limit(1);

  const metadata = {
    ...(existing?.metadata ?? {}),
    fastScoreSignals: result.signals,
  };

  await db
    .update(memoryChunks)
    .set({
      lifecycle: result.lifecycle,
      fastScore: result.score,
      metadata,
    })
    .where(eq(memoryChunks.id, input.chunkId));

  return result;
}
