import type { KeenaiDb } from "@keenai/storage";
import { conversations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { appendBuffer } from "./append-buffer.js";
import type { BufferConfig } from "./buffer-config.js";
import { isChannelScopedTreeType } from "./channel-config.js";
import { channelScopeKey } from "./scope-key.js";
import { sealBuffer } from "./seal-buffer.js";

export type ChannelRouteChunkInput = {
  orgId: string;
  brandId: string;
  chunkId: string;
  channelType: string;
  channelId: string;
  config?: Partial<BufferConfig>;
};

export type ChannelRouteChunkResult = {
  routed: boolean;
  scopeKey: string;
  appended: boolean;
  sealed: boolean;
  summaryId?: string;
  episodeId?: string;
  reason?: string;
};

/** Route an admitted/buffered chunk into a channel-scoped source tree (Slack/Telegram). */
export async function channelRouteChunk(
  db: KeenaiDb,
  input: ChannelRouteChunkInput,
): Promise<ChannelRouteChunkResult> {
  if (!isChannelScopedTreeType(input.channelType)) {
    return {
      routed: false,
      scopeKey: "",
      appended: false,
      sealed: false,
      reason: "channel_type_not_scoped",
    };
  }

  const scopeKey = channelScopeKey(input.channelType, input.channelId);
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
      scopeKey,
      appended: false,
      sealed: false,
      reason: appendResult.reason,
    };
  }

  if (!appendResult.shouldSeal) {
    return {
      routed: true,
      scopeKey,
      appended: appendResult.appended,
      sealed: false,
    };
  }

  const sealResult = await sealBuffer(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scopeKey,
  });

  return {
    routed: true,
    scopeKey,
    appended: appendResult.appended,
    sealed: sealResult.sealed,
    summaryId: sealResult.summaryId,
    episodeId: sealResult.episodeId,
    reason: sealResult.sealed ? undefined : sealResult.reason,
  };
}

export async function resolveConversationChannel(
  db: KeenaiDb,
  input: { orgId: string; conversationId: string },
): Promise<{ channelType: string; channelId: string } | null> {
  const [row] = await db
    .select({
      channelType: conversations.channelType,
      channelId: conversations.channelId,
    })
    .from(conversations)
    .where(and(eq(conversations.orgId, input.orgId), eq(conversations.id, input.conversationId)))
    .limit(1);

  if (!row?.channelType || !row.channelId) return null;
  return { channelType: row.channelType, channelId: row.channelId };
}
