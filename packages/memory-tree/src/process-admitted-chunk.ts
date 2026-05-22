import type { KeenaiDb } from "@keenai/storage";
import { memoryChunks } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { appendBuffer } from "./append-buffer.js";
import type { BufferConfig } from "./buffer-config.js";
import { channelRouteChunk, resolveConversationChannel } from "./channel-route.js";
import { extractChunk } from "./extract-chunk.js";
import { conversationScopeKey } from "./scope-key.js";
import { sealBuffer } from "./seal-buffer.js";
import type { MemorySummaryFtsIndexer } from "./summary-fts-index.js";
import { resolveConversationUserId, topicRouteChunk } from "./topic-route.js";

export type ProcessAdmittedChunkInput = {
  orgId: string;
  brandId: string;
  chunkId: string;
  config?: Partial<BufferConfig>;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export type ProcessAdmittedChunkResult = {
  chunkId: string;
  extracted: boolean;
  appended: boolean;
  sealed: boolean;
  summaryId?: string;
  episodeId?: string;
  topicRouted?: boolean;
  topicSealed?: boolean;
  topicHotness?: number;
  channelRouted?: boolean;
  channelSealed?: boolean;
  channelScopeKey?: string;
  reason?: string;
};

/** Run extract → append_buffer → seal pipeline for an admitted chunk. */
export async function processAdmittedChunk(
  db: KeenaiDb,
  input: ProcessAdmittedChunkInput,
): Promise<ProcessAdmittedChunkResult> {
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

  const conversationId = chunk?.metadata?.conversationId;
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: false,
      sealed: false,
      reason: "no_conversation_scope",
    };
  }

  const scopeKey = conversationScopeKey(conversationId);
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
      reason: appendResult.reason,
    };
  }

  if (!appendResult.shouldSeal) {
    const topicResult = await routeTopicIfEligible(db, input, conversationId);
    const channelResult = await routeChannelIfEligible(db, input, conversationId);
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: true,
      sealed: false,
      topicRouted: topicResult?.routed,
      topicSealed: topicResult?.sealed,
      topicHotness: topicResult?.hotness,
      channelRouted: channelResult?.routed,
      channelSealed: channelResult?.sealed,
      channelScopeKey: channelResult?.scopeKey,
    };
  }

  const sealResult = await sealBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scopeKey,
    summaryFtsIndexer: input.summaryFtsIndexer,
  });

  const topicResult = await routeTopicIfEligible(db, input, conversationId);
  const channelResult = await routeChannelIfEligible(db, input, conversationId);

  return {
    chunkId: input.chunkId,
    extracted: true,
    appended: true,
    sealed: sealResult.sealed,
    summaryId: sealResult.summaryId,
    episodeId: sealResult.episodeId,
    topicRouted: topicResult?.routed,
    topicSealed: topicResult?.sealed,
    topicHotness: topicResult?.hotness,
    channelRouted: channelResult?.routed,
    channelSealed: channelResult?.sealed,
    channelScopeKey: channelResult?.scopeKey,
    reason: sealResult.sealed ? undefined : sealResult.reason,
  };
}

async function routeChannelIfEligible(
  db: KeenaiDb,
  input: ProcessAdmittedChunkInput,
  conversationId: string,
) {
  const channel = await resolveConversationChannel(db, {
    orgId: input.orgId,
    conversationId,
  });
  if (!channel) return null;

  return channelRouteChunk(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    chunkId: input.chunkId,
    channelType: channel.channelType,
    channelId: channel.channelId,
    config: input.config,
    summaryFtsIndexer: input.summaryFtsIndexer,
  });
}

async function routeTopicIfEligible(
  db: KeenaiDb,
  input: ProcessAdmittedChunkInput,
  conversationId: string,
) {
  const userId = await resolveConversationUserId(db, {
    orgId: input.orgId,
    conversationId,
  });
  if (!userId) return null;

  return topicRouteChunk(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    chunkId: input.chunkId,
    userId,
    config: input.config,
    summaryFtsIndexer: input.summaryFtsIndexer,
  });
}
