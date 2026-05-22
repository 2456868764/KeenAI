import type { KeenaiDb } from "@keenai/storage";
import { memoryChunks, memoryTreeBuffers } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { type BufferConfig, DEFAULT_BUFFER_CONFIG } from "./buffer-config.js";
import { estimateTokenCount, extractBodyFromCanonicalMd } from "./canonical-body.js";

export type AppendBufferInput = {
  orgId: string;
  brandId: string;
  chunkId: string;
  scopeKey: string;
  config?: Partial<BufferConfig>;
  /** Allow re-append when chunk is already buffered (topic tree shares leaves). */
  allowBuffered?: boolean;
};

export type AppendBufferResult = {
  appended: boolean;
  scopeKey: string;
  leafCount: number;
  shouldSeal: boolean;
  reason?: string;
};

async function getOrCreateBuffer(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; scopeKey: string },
) {
  const [existing] = await db
    .select()
    .from(memoryTreeBuffers)
    .where(
      and(
        eq(memoryTreeBuffers.orgId, input.orgId),
        eq(memoryTreeBuffers.brandId, input.brandId),
        eq(memoryTreeBuffers.scopeKey, input.scopeKey),
        eq(memoryTreeBuffers.level, 0),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const inserted = await db
    .insert(memoryTreeBuffers)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      scopeKey: input.scopeKey,
      level: 0,
      leafIds: [],
      tokenCount: 0,
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("memory_buffer_create_failed");
  return row;
}

/** Append an admitted chunk to the L0 source-tree buffer. */
export async function appendBuffer(
  db: KeenaiDb,
  input: AppendBufferInput,
): Promise<AppendBufferResult> {
  const config: BufferConfig = { ...DEFAULT_BUFFER_CONFIG, ...input.config };

  const [chunk] = await db
    .select()
    .from(memoryChunks)
    .where(and(eq(memoryChunks.id, input.chunkId), eq(memoryChunks.orgId, input.orgId)))
    .limit(1);

  if (!chunk) {
    return {
      appended: false,
      scopeKey: input.scopeKey,
      leafCount: 0,
      shouldSeal: false,
      reason: "chunk_not_found",
    };
  }

  if (chunk.lifecycle !== "admitted" && !(input.allowBuffered && chunk.lifecycle === "buffered")) {
    return {
      appended: false,
      scopeKey: input.scopeKey,
      leafCount: 0,
      shouldSeal: false,
      reason: `invalid_lifecycle:${chunk.lifecycle}`,
    };
  }

  const buffer = await getOrCreateBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scopeKey: input.scopeKey,
  });

  const leafIds = [...buffer.leafIds];
  const isNew = !leafIds.includes(input.chunkId);
  if (isNew) {
    leafIds.push(input.chunkId);
  }

  const body = extractBodyFromCanonicalMd(chunk.bodyMd);
  const tokenCount = buffer.tokenCount + (isNew ? estimateTokenCount(body) : 0);

  await db
    .update(memoryTreeBuffers)
    .set({
      leafIds,
      tokenCount,
      updatedAt: new Date(),
    })
    .where(eq(memoryTreeBuffers.id, buffer.id));

  if (isNew) {
    await db
      .update(memoryChunks)
      .set({ lifecycle: "buffered" })
      .where(and(eq(memoryChunks.id, input.chunkId), eq(memoryChunks.lifecycle, "admitted")));
  }

  const shouldSeal = leafIds.length >= config.maxLeaves || tokenCount >= config.maxTokens;

  return {
    appended: isNew,
    scopeKey: input.scopeKey,
    leafCount: leafIds.length,
    shouldSeal,
  };
}
