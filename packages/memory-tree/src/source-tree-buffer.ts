import type { KeenaiDb } from "@keenai/storage";
import { memoryChunks } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { appendBuffer } from "./append-buffer.js";
import type { BufferConfig } from "./buffer-config.js";
import { extractChunk } from "./extract-chunk.js";
import { conversationScopeKey } from "./scope-key.js";
import { sealBuffer } from "./seal-buffer.js";
import type { MemorySummaryFtsIndexer } from "./summary-fts-index.js";

export const KEENI_MEMORY_TREE_MT03 = {
  enabled: true,
  target: "conv:* buffer + seal → memory_episodes",
  notes: "MT-03 stub: extract_chunk → append_buffer → seal_bucket on source tree L0.",
} as const;

export type RunSourceTreeBufferSealInput = {
  orgId: string;
  brandId: string;
  chunkId: string;
  config?: Partial<BufferConfig>;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export type RunSourceTreeBufferSealResult = {
  chunkId: string;
  extracted: boolean;
  appended: boolean;
  sealed: boolean;
  scopeKey?: string;
  conversationId?: string;
  summaryId?: string;
  episodeId?: string;
  reason?: string;
};

/** Resolve `conv:{conversationId}` from chunk metadata. */
export function conversationScopeKeyFromChunk(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const conversationId = metadata?.conversationId;
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return null;
  }
  return conversationScopeKey(conversationId);
}

/** MT-03 stub: source-tree extract → L0 append → seal when buffer thresholds hit. */
export async function runSourceTreeBufferSealStub(
  db: KeenaiDb,
  input: RunSourceTreeBufferSealInput,
): Promise<RunSourceTreeBufferSealResult> {
  const extractResult = await extractChunk(db, input.chunkId);
  if (!extractResult.processed) {
    return {
      chunkId: input.chunkId,
      extracted: false,
      appended: false,
      sealed: false,
      reason: "extract_skipped",
    };
  }

  const [chunk] = await db
    .select()
    .from(memoryChunks)
    .where(and(eq(memoryChunks.id, input.chunkId), eq(memoryChunks.orgId, input.orgId)))
    .limit(1);

  const scopeKey = conversationScopeKeyFromChunk(chunk?.metadata);
  if (!scopeKey) {
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: false,
      sealed: false,
      reason: "no_conversation_scope",
    };
  }

  const conversationId =
    typeof chunk?.metadata?.conversationId === "string" ? chunk.metadata.conversationId : undefined;

  const appendResult = await appendBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    chunkId: input.chunkId,
    scopeKey,
    config: input.config,
  });

  if (!appendResult.appended) {
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: false,
      sealed: false,
      scopeKey,
      conversationId,
      reason: appendResult.reason,
    };
  }

  if (!appendResult.shouldSeal) {
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: true,
      sealed: false,
      scopeKey,
      conversationId,
    };
  }

  const sealResult = await sealBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scopeKey,
    summaryFtsIndexer: input.summaryFtsIndexer,
  });

  return {
    chunkId: input.chunkId,
    extracted: true,
    appended: true,
    sealed: sealResult.sealed,
    scopeKey,
    conversationId,
    summaryId: sealResult.summaryId,
    episodeId: sealResult.episodeId,
    reason: sealResult.sealed ? undefined : sealResult.reason,
  };
}
