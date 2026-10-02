import type { KeenaiDb, VectorStore } from "@keenai/storage";
import {
  memoryChunkVectors,
  memoryChunks,
  memoryEntities,
  memoryEpisodes,
  memoryFacts,
  memoryRelations,
  memorySlots,
  memorySummaries,
  memoryTreeBuffers,
} from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { estimateTokenCount, extractBodyFromCanonicalMd } from "./canonical-body.js";
import { conversationMessageSourceRef } from "./canonicalize.js";
import type { MemoryChunkFtsIndexer } from "./chunk-fts-index.js";
import { recomputeMemorySlots } from "./recompute-slots.js";

type DeletableIndex = Pick<MemoryChunkFtsIndexer, "index"> & {
  deleteByIds(ids: string[]): Promise<void>;
};

export type InvalidateConversationMessageMemoryInput = {
  orgId: string;
  brandId: string;
  messageId: string;
  chunkFts?: DeletableIndex | null;
  chunkVectorStore?: VectorStore | null;
  summaryFts?: { deleteByIds(ids: string[]): Promise<void> } | null;
};

export type InvalidateConversationMessageMemoryResult = {
  chunkIds: string[];
  summaryIds: string[];
  episodeIds: string[];
  archivedFactIds: string[];
  updatedBufferIds: string[];
};

function referencesSource(
  provenance: { chunkIds?: string[]; messageIds?: string[] } | null | undefined,
  messageId: string,
  chunkIds: Set<string>,
): boolean {
  return Boolean(
    provenance?.messageIds?.includes(messageId) ||
      provenance?.chunkIds?.some((chunkId) => chunkIds.has(chunkId)),
  );
}

/**
 * Remove every retrievable Memory Tree projection derived from one source message.
 * This is used before rebuilding an edited message and as the terminal step for a deletion.
 */
export async function invalidateConversationMessageMemory(
  db: KeenaiDb,
  input: InvalidateConversationMessageMemoryInput,
): Promise<InvalidateConversationMessageMemoryResult> {
  const chunks = await db
    .select()
    .from(memoryChunks)
    .where(
      and(
        eq(memoryChunks.orgId, input.orgId),
        eq(memoryChunks.brandId, input.brandId),
        eq(memoryChunks.sourceRef, conversationMessageSourceRef(input.messageId)),
      ),
    );
  const chunkIds = chunks.map((chunk) => chunk.id);
  const chunkIdSet = new Set(chunkIds);

  const summaryCandidates = await db
    .select()
    .from(memorySummaries)
    .where(and(eq(memorySummaries.orgId, input.orgId), eq(memorySummaries.brandId, input.brandId)));
  const affectedSummaries = summaryCandidates.filter((summary) =>
    referencesSource(summary.provenance, input.messageId, chunkIdSet),
  );
  const summaryIds = affectedSummaries.map((summary) => summary.id);
  const summaryIdSet = new Set(summaryIds);

  const episodeCandidates = await db
    .select()
    .from(memoryEpisodes)
    .where(and(eq(memoryEpisodes.orgId, input.orgId), eq(memoryEpisodes.brandId, input.brandId)));
  const affectedEpisodes = episodeCandidates.filter((episode) => {
    const metadata = episode.metadata as {
      summaryId?: unknown;
      chunkIds?: unknown;
      messageIds?: unknown;
    };
    return Boolean(
      (typeof metadata.summaryId === "string" && summaryIdSet.has(metadata.summaryId)) ||
        (Array.isArray(metadata.messageIds) && metadata.messageIds.includes(input.messageId)) ||
        (Array.isArray(metadata.chunkIds) &&
          metadata.chunkIds.some((chunkId) =>
            typeof chunkId === "string" ? chunkIdSet.has(chunkId) : false,
          )),
    );
  });
  const episodeIds = affectedEpisodes.map((episode) => episode.id);

  const bufferCandidates = await db
    .select()
    .from(memoryTreeBuffers)
    .where(
      and(eq(memoryTreeBuffers.orgId, input.orgId), eq(memoryTreeBuffers.brandId, input.brandId)),
    );
  const affectedBuffers = bufferCandidates.filter((buffer) =>
    buffer.leafIds.some((chunkId) => chunkIdSet.has(chunkId)),
  );
  for (const buffer of affectedBuffers) {
    const leafIds = buffer.leafIds.filter((chunkId) => !chunkIdSet.has(chunkId));
    const remainingChunks =
      leafIds.length > 0
        ? await db
            .select({ id: memoryChunks.id, bodyMd: memoryChunks.bodyMd })
            .from(memoryChunks)
            .where(and(eq(memoryChunks.orgId, input.orgId), inArray(memoryChunks.id, leafIds)))
        : [];
    const byId = new Map(remainingChunks.map((chunk) => [chunk.id, chunk]));
    const tokenCount = leafIds.reduce((total, id) => {
      const chunk = byId.get(id);
      return total + (chunk ? estimateTokenCount(extractBodyFromCanonicalMd(chunk.bodyMd)) : 0);
    }, 0);
    await db
      .update(memoryTreeBuffers)
      .set({ leafIds, tokenCount, updatedAt: new Date() })
      .where(eq(memoryTreeBuffers.id, buffer.id));
  }

  if (chunkIds.length > 0) {
    await input.chunkFts?.deleteByIds(chunkIds);
    await input.chunkVectorStore?.deleteByIds(chunkIds);
  }
  if (summaryIds.length > 0) await input.summaryFts?.deleteByIds(summaryIds);

  const affectedFacts =
    summaryIds.length > 0
      ? await db
          .select()
          .from(memoryFacts)
          .where(
            and(eq(memoryFacts.orgId, input.orgId), inArray(memoryFacts.summaryId, summaryIds)),
          )
      : [];
  const affectedScopes = [
    ...new Map<string, { scope: string; scopeId: string }>(
      affectedFacts.map((fact) => [
        `${fact.scope}\0${fact.scopeId}`,
        { scope: fact.scope, scopeId: fact.scopeId },
      ]),
    ).values(),
  ];
  const now = new Date();

  if (summaryIds.length > 0) {
    await db.delete(memoryRelations).where(inArray(memoryRelations.summaryId, summaryIds));
    await db
      .update(memoryEntities)
      .set({ summaryId: null, updatedAt: now })
      .where(inArray(memoryEntities.summaryId, summaryIds));
    await db
      .update(memoryFacts)
      .set({ status: "archived", archivedAt: now, summaryId: null, updatedAt: now })
      .where(inArray(memoryFacts.summaryId, summaryIds));
  }
  if (episodeIds.length > 0) {
    await db.delete(memoryEpisodes).where(inArray(memoryEpisodes.id, episodeIds));
  }
  if (summaryIds.length > 0) {
    await db.delete(memorySummaries).where(inArray(memorySummaries.id, summaryIds));
  }
  if (chunkIds.length > 0) {
    await db.delete(memoryChunkVectors).where(inArray(memoryChunkVectors.chunkId, chunkIds));
    await db.delete(memoryChunks).where(inArray(memoryChunks.id, chunkIds));
  }

  for (const { scope, scopeId } of affectedScopes) {
    await db
      .delete(memorySlots)
      .where(
        and(
          eq(memorySlots.orgId, input.orgId),
          eq(memorySlots.brandId, input.brandId),
          eq(memorySlots.scope, scope),
          eq(memorySlots.scopeId, scopeId),
        ),
      );
    await recomputeMemorySlots(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      scope,
      scopeId,
      source: "message_invalidation",
    });
  }

  return {
    chunkIds,
    summaryIds,
    episodeIds,
    archivedFactIds: affectedFacts.map((fact) => fact.id),
    updatedBufferIds: affectedBuffers.map((buffer) => buffer.id),
  };
}
