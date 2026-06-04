import type { PreparedMemoryChunk } from "./prepare-chunk.js";
import type { MemoryChunkLifecycle } from "./types.js";

/** Aligns with `@keenai/memory` `MEMORY_INNGEST_EVENTS.EXTRACT_CHUNK`. */
export const MEMORY_TREE_EXTRACT_CHUNK_EVENT = "keenai/memory.extract_chunk";

export const KEENI_MEMORY_TREE_MT02 = {
  enabled: true,
  target: "memory.extract_chunk",
  notes: "After admitted persist, enqueue async extract_chunk (MT-02 stub).",
} as const;

export type ExtractChunkEnqueuePayload = {
  orgId: string;
  brandId: string;
  chunkId: string;
};

export type EnqueueExtractChunkInput = ExtractChunkEnqueuePayload & {
  /** Set false when persist was a dedupe (default true). */
  created?: boolean;
} & ({ prepared: PreparedMemoryChunk } | { lifecycle: MemoryChunkLifecycle });

/** Whether an admitted chunk should trigger `memory.extract_chunk` (hot-path prepared chunk). */
export function shouldEnqueueExtractChunk(
  prepared: PreparedMemoryChunk,
  opts?: { created?: boolean },
): boolean {
  if (opts?.created === false) return false;
  return prepared.shouldPersist && prepared.lifecycle === "admitted";
}

/** Gate after `ingestConversationMessage` / DB persist + fast-score. */
export function shouldEnqueueExtractChunkAfterPersist(result: {
  created: boolean;
  lifecycle: MemoryChunkLifecycle;
}): boolean {
  if (!result.created) return false;
  return result.lifecycle === "admitted";
}

function shouldEnqueueExtractChunkInput(input: EnqueueExtractChunkInput): boolean {
  if (input.created === false) return false;
  if ("prepared" in input) {
    return shouldEnqueueExtractChunk(input.prepared, { created: input.created });
  }
  return shouldEnqueueExtractChunkAfterPersist({
    created: input.created ?? true,
    lifecycle: input.lifecycle,
  });
}

export function buildExtractChunkEnqueuePayload(
  prepared: PreparedMemoryChunk,
  scope: { orgId: string; brandId: string },
): ExtractChunkEnqueuePayload {
  return {
    orgId: scope.orgId,
    brandId: scope.brandId,
    chunkId: prepared.chunkId,
  };
}

/** MT-02 stub: enqueue extract_chunk when fast-score admits a newly persisted chunk. */
export async function enqueueExtractChunkIfAdmitted(
  input: EnqueueExtractChunkInput,
  enqueue: (payload: ExtractChunkEnqueuePayload) => Promise<void>,
): Promise<boolean> {
  if (!shouldEnqueueExtractChunkInput(input)) {
    return false;
  }

  await enqueue({
    orgId: input.orgId,
    brandId: input.brandId,
    chunkId: input.chunkId,
  });
  return true;
}
