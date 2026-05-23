import type { KeenaiDb } from "@keenai/storage";
import { memoryTreeBuffers } from "@keenai/storage/schema";
import { and, eq, lt } from "drizzle-orm";
import { sealBuffer } from "./seal-buffer.js";
import type { MemorySummaryFtsIndexer } from "./summary-fts-index.js";

/** Default stale threshold: 1 hour (aligned with hourly flush cron). */
export const DEFAULT_BUFFER_STALE_MS = 60 * 60 * 1000;

export type FlushStaleBuffersInput = {
  staleAfterMs?: number;
  orgId?: string;
  brandId?: string;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
  now?: Date;
};

export type FlushStaleBufferResult = {
  orgId: string;
  brandId: string;
  scopeKey: string;
  summaryId?: string;
  sealedCount: number;
};

export type FlushStaleBuffersResult = {
  buffersChecked: number;
  flushed: number;
  summaryIds: string[];
  results: FlushStaleBufferResult[];
};

/** Seal non-empty buffers that have not been updated within the stale window. */
export async function flushStaleBuffers(
  db: KeenaiDb,
  input: FlushStaleBuffersInput = {},
): Promise<FlushStaleBuffersResult> {
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_BUFFER_STALE_MS;
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - staleAfterMs);

  const conditions = [lt(memoryTreeBuffers.updatedAt, cutoff)];
  if (input.orgId) conditions.push(eq(memoryTreeBuffers.orgId, input.orgId));
  if (input.brandId) conditions.push(eq(memoryTreeBuffers.brandId, input.brandId));

  const buffers = await db
    .select()
    .from(memoryTreeBuffers)
    .where(and(...conditions));

  const results: FlushStaleBufferResult[] = [];
  const summaryIds: string[] = [];

  for (const buffer of buffers) {
    if (buffer.leafIds.length === 0) continue;

    const sealResult = await sealBuffer(db, {
      orgId: buffer.orgId,
      brandId: buffer.brandId,
      scopeKey: buffer.scopeKey,
      level: buffer.level,
      summaryFtsIndexer: input.summaryFtsIndexer,
    });

    if (!sealResult.sealed || !sealResult.summaryId) continue;

    summaryIds.push(sealResult.summaryId);
    results.push({
      orgId: buffer.orgId,
      brandId: buffer.brandId,
      scopeKey: buffer.scopeKey,
      summaryId: sealResult.summaryId,
      sealedCount: sealResult.sealedCount,
    });
  }

  return {
    buffersChecked: buffers.length,
    flushed: results.length,
    summaryIds,
    results,
  };
}
