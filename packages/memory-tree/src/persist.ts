import type { KeenaiDb } from "@keenai/storage";
import { memoryChunks } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { computeMemoryChunkId } from "./chunk-id.js";
import type { PersistMemoryChunkInput, PersistMemoryChunkResult } from "./types.js";

/** Persist a memory chunk; skips insert when content id already exists. */
export async function persistMemoryChunk(
  db: KeenaiDb,
  input: PersistMemoryChunkInput,
): Promise<PersistMemoryChunkResult> {
  const id = computeMemoryChunkId(input.orgId, input.brandId, input.sourceRef, input.bodyMd);
  const lifecycle = input.lifecycle ?? "pending_extraction";

  const inserted = await db
    .insert(memoryChunks)
    .values({
      id,
      orgId: input.orgId,
      brandId: input.brandId,
      source: input.source,
      sourceRef: input.sourceRef,
      bodyMd: input.bodyMd,
      lifecycle,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) {
    return { id, created: true, chunk: inserted[0] };
  }

  const [existing] = await db
    .select()
    .from(memoryChunks)
    .where(and(eq(memoryChunks.id, id), eq(memoryChunks.orgId, input.orgId)))
    .limit(1);

  if (!existing) throw new Error("memory_chunk_persist_failed");

  return { id, created: false, chunk: existing };
}

export async function getMemoryChunkBySourceRef(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; sourceRef: string },
) {
  const [row] = await db
    .select()
    .from(memoryChunks)
    .where(
      and(
        eq(memoryChunks.orgId, input.orgId),
        eq(memoryChunks.brandId, input.brandId),
        eq(memoryChunks.sourceRef, input.sourceRef),
      ),
    )
    .limit(1);
  return row ?? null;
}
