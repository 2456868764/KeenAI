import type { KeenaiDb } from "@keenai/storage";
import { conversations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { appendBuffer } from "./append-buffer.js";
import type { BufferConfig } from "./buffer-config.js";
import { DEFAULT_HOTNESS_THRESHOLD } from "./hotness-config.js";
import { refreshCustomerHotness } from "./hotness.js";
import { customerScopeKey } from "./scope-key.js";
import { sealBuffer } from "./seal-buffer.js";
import type { MemorySummaryFtsIndexer } from "./summary-fts-index.js";

export type TopicRouteChunkInput = {
  orgId: string;
  brandId: string;
  chunkId: string;
  userId: string;
  config?: Partial<BufferConfig>;
  hotnessThreshold?: number;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export type TopicRouteChunkResult = {
  routed: boolean;
  hotness: number;
  hot: boolean;
  appended: boolean;
  sealed: boolean;
  summaryId?: string;
  episodeId?: string;
  reason?: string;
};

/** Route an admitted/buffered chunk into the customer topic tree when hotness qualifies. */
export async function topicRouteChunk(
  db: KeenaiDb,
  input: TopicRouteChunkInput,
): Promise<TopicRouteChunkResult> {
  const threshold = input.hotnessThreshold ?? DEFAULT_HOTNESS_THRESHOLD;
  const hotness = await refreshCustomerHotness(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    userId: input.userId,
    threshold,
  });

  if (!hotness.hot) {
    return {
      routed: false,
      hotness: hotness.score,
      hot: false,
      appended: false,
      sealed: false,
      reason: "below_hotness_threshold",
    };
  }

  const scopeKey = customerScopeKey(input.userId);
  const appendResult = await appendBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    chunkId: input.chunkId,
    scopeKey,
    config: input.config,
    allowBuffered: true,
  });

  if (!appendResult.appended && appendResult.reason !== undefined) {
    return {
      routed: false,
      hotness: hotness.score,
      hot: true,
      appended: false,
      sealed: false,
      reason: appendResult.reason,
    };
  }

  if (!appendResult.shouldSeal) {
    return {
      routed: true,
      hotness: hotness.score,
      hot: true,
      appended: appendResult.appended,
      sealed: false,
    };
  }

  const sealResult = await sealBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scopeKey,
    summaryFtsIndexer: input.summaryFtsIndexer,
  });

  return {
    routed: true,
    hotness: hotness.score,
    hot: true,
    appended: appendResult.appended,
    sealed: sealResult.sealed,
    summaryId: sealResult.summaryId,
    episodeId: sealResult.episodeId,
    reason: sealResult.sealed ? undefined : sealResult.reason,
  };
}

export async function resolveConversationUserId(
  db: KeenaiDb,
  input: { orgId: string; conversationId: string },
): Promise<string | null> {
  const [row] = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(and(eq(conversations.orgId, input.orgId), eq(conversations.id, input.conversationId)))
    .limit(1);

  return row?.userId ?? null;
}
