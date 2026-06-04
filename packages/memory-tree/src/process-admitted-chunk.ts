import type { KeenaiDb } from "@keenai/storage";
import type { BufferConfig } from "./buffer-config.js";
import { channelRouteChunk, resolveConversationChannel } from "./channel-route.js";
import { runSourceTreeBufferSealStub } from "./source-tree-buffer.js";
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
  summaryIds: string[];
  episodeId?: string;
  topicRouted?: boolean;
  topicSealed?: boolean;
  topicHotness?: number;
  channelRouted?: boolean;
  channelSealed?: boolean;
  channelScopeKey?: string;
  reason?: string;
};

function collectSummaryIds(...ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Run extract → append_buffer → seal pipeline for an admitted chunk. */
export async function processAdmittedChunk(
  db: KeenaiDb,
  input: ProcessAdmittedChunkInput,
): Promise<ProcessAdmittedChunkResult> {
  const source = await runSourceTreeBufferSealStub(db, input);

  if (!source.extracted) {
    return {
      chunkId: input.chunkId,
      extracted: false,
      appended: false,
      sealed: false,
      summaryIds: [],
      reason: source.reason ?? "extract_skipped",
    };
  }

  if (!source.appended) {
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: false,
      sealed: false,
      summaryIds: [],
      reason: source.reason,
    };
  }

  const conversationId = source.conversationId;
  if (!conversationId) {
    return {
      chunkId: input.chunkId,
      extracted: true,
      appended: true,
      sealed: source.sealed,
      summaryId: source.summaryId,
      summaryIds: collectSummaryIds(source.summaryId),
      episodeId: source.episodeId,
      reason: source.reason,
    };
  }

  const topicResult = await routeTopicIfEligible(db, input, conversationId);
  const channelResult = await routeChannelIfEligible(db, input, conversationId);

  return {
    chunkId: input.chunkId,
    extracted: true,
    appended: true,
    sealed: source.sealed,
    summaryId: source.summaryId,
    summaryIds: collectSummaryIds(
      source.summaryId,
      topicResult?.summaryId,
      channelResult?.summaryId,
    ),
    episodeId: source.episodeId,
    topicRouted: topicResult?.routed,
    topicSealed: topicResult?.sealed,
    topicHotness: topicResult?.hotness,
    channelRouted: channelResult?.routed,
    channelSealed: channelResult?.sealed,
    channelScopeKey: channelResult?.scopeKey,
    reason: source.reason,
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
