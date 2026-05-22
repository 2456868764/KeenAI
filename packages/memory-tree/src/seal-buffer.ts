import type { KeenaiDb } from "@keenai/storage";
import {
  memoryChunks,
  memoryEpisodes,
  memorySummaries,
  memoryTreeBuffers,
} from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { extractBodyFromCanonicalMd, messageIdFromChunk } from "./canonical-body.js";
import { episodeTargetFromScopeKey } from "./scope-key.js";
import { stubSealSummary } from "./stub-seal.js";
import { type MemorySummaryFtsIndexer, indexMemorySummaryInFts } from "./summary-fts-index.js";

export type SealBufferInput = {
  orgId: string;
  brandId: string;
  scopeKey: string;
  level?: number;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export type SealBufferResult = {
  sealed: boolean;
  scopeKey: string;
  summaryId?: string;
  episodeId?: string;
  sealedCount: number;
  reason?: string;
};

/** Seal an L0 buffer into L1 summary + materialized episode (stub, no LLM). */
export async function sealBuffer(db: KeenaiDb, input: SealBufferInput): Promise<SealBufferResult> {
  const level = input.level ?? 0;

  const [buffer] = await db
    .select()
    .from(memoryTreeBuffers)
    .where(
      and(
        eq(memoryTreeBuffers.orgId, input.orgId),
        eq(memoryTreeBuffers.brandId, input.brandId),
        eq(memoryTreeBuffers.scopeKey, input.scopeKey),
        eq(memoryTreeBuffers.level, level),
      ),
    )
    .limit(1);

  if (!buffer || buffer.leafIds.length === 0) {
    return {
      sealed: false,
      scopeKey: input.scopeKey,
      sealedCount: 0,
      reason: "empty_buffer",
    };
  }

  const chunkRows = await db
    .select()
    .from(memoryChunks)
    .where(and(eq(memoryChunks.orgId, input.orgId), inArray(memoryChunks.id, buffer.leafIds)));

  const chunkById = new Map(chunkRows.map((row) => [row.id, row]));
  const orderedChunks = buffer.leafIds
    .map((id) => chunkById.get(id))
    .filter((row): row is (typeof chunkRows)[number] => Boolean(row));

  if (orderedChunks.length === 0) {
    return {
      sealed: false,
      scopeKey: input.scopeKey,
      sealedCount: 0,
      reason: "chunks_missing",
    };
  }

  const sealed = stubSealSummary({
    scopeKey: input.scopeKey,
    chunks: orderedChunks.map((chunk) => ({
      id: chunk.id,
      bodyMd: extractBodyFromCanonicalMd(chunk.bodyMd),
      messageId: messageIdFromChunk({
        sourceRef: chunk.sourceRef,
        metadata: chunk.metadata,
      }),
      createdAt: chunk.createdAt,
    })),
  });

  const [summaryRow] = await db
    .insert(memorySummaries)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      scopeKey: input.scopeKey,
      level: 1,
      title: sealed.title,
      summary: sealed.summary,
      provenance: {
        chunkIds: sealed.chunkIds,
        messageIds: sealed.messageIds,
        keyEvents: sealed.keyEvents,
      },
    })
    .returning();

  if (!summaryRow) throw new Error("memory_summary_create_failed");

  await indexMemorySummaryInFts(input.summaryFtsIndexer, {
    id: summaryRow.id,
    orgId: summaryRow.orgId,
    brandId: summaryRow.brandId,
    scopeKey: summaryRow.scopeKey,
    level: summaryRow.level,
    title: summaryRow.title,
    summary: summaryRow.summary,
  });

  const { scope: episodeScope, scopeId: episodeScopeId } = episodeTargetFromScopeKey(
    input.scopeKey,
  );
  const [episodeRow] = await db
    .insert(memoryEpisodes)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      scope: episodeScope,
      scopeId: episodeScopeId,
      summary: sealed.summary,
      topic: sealed.title,
      startsAt: sealed.startsAt,
      endsAt: sealed.endsAt,
      metadata: {
        summaryId: summaryRow.id,
        scopeKey: input.scopeKey,
        chunkIds: sealed.chunkIds,
        messageIds: sealed.messageIds,
        keyEvents: sealed.keyEvents,
      },
    })
    .returning();

  if (!episodeRow) throw new Error("memory_episode_create_failed");

  await db
    .update(memoryChunks)
    .set({ lifecycle: "sealed" })
    .where(inArray(memoryChunks.id, sealed.chunkIds));

  await db
    .update(memoryTreeBuffers)
    .set({
      leafIds: [],
      tokenCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(memoryTreeBuffers.id, buffer.id));

  return {
    sealed: true,
    scopeKey: input.scopeKey,
    summaryId: summaryRow.id,
    episodeId: episodeRow.id,
    sealedCount: sealed.chunkIds.length,
  };
}
