import type { FTSStore, KeenaiDb } from "@keenai/storage";
import {
  memoryChunks,
  memoryHotness,
  memorySummaries,
  memoryTreeBuffers,
} from "@keenai/storage/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { extractBodyFromCanonicalMd, messageIdFromChunk } from "./canonical-body.js";
import { isChannelScopedTreeType } from "./channel-config.js";
import { DEFAULT_HOTNESS_THRESHOLD } from "./hotness-config.js";
import {
  conversationIdFromScopeKey,
  customerIdFromScopeKey,
  parseChannelScopeKey,
} from "./scope-key.js";

export type QueryMemoryExplorerStatsInput = {
  orgId: string;
  brandId: string;
};

export type MemoryExplorerStats = {
  brandId: string;
  chunkCount: number;
  sourceCount: number;
  topicCount: number;
  hotTopicCount: number;
  storageBytes: number;
};

export type SearchMemoryChunksInput = {
  orgId: string;
  brandId: string;
  q: string;
  scope?: "all" | "conversation" | "customer" | "channel";
  limit?: number;
  /** LibSQL fts_memory_chunks store (KM-03). Falls back to SQL LIKE when omitted. */
  chunkFts?: Pick<FTSStore, "search"> | null;
};

export type MemorySearchHit = {
  chunkId: string;
  scope: "conversation" | "customer" | "channel" | "unknown";
  conversationId: string | null;
  messageId: string | null;
  userId: string | null;
  body: string;
  lifecycle: string;
  fastScore: number | null;
  ftsScore: number | null;
  snippet: string | null;
  createdAt: string;
};

export type SearchMemoryChunksResult = {
  q: string;
  scope: "all" | "conversation" | "customer" | "channel";
  hits: MemorySearchHit[];
};

function escapeLikePattern(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&");
}

/** Aggregate Memory Explorer dashboard metrics for a brand. */
export async function queryMemoryExplorerStats(
  db: KeenaiDb,
  input: QueryMemoryExplorerStatsInput,
): Promise<MemoryExplorerStats> {
  const base = and(eq(memoryChunks.orgId, input.orgId), eq(memoryChunks.brandId, input.brandId));

  const [chunkRow] = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(length(${memoryChunks.bodyMd})), 0)`,
    })
    .from(memoryChunks)
    .where(base);

  const [sourceRow] = await db
    .select({ count: sql<number>`count(distinct ${memoryTreeBuffers.scopeKey})` })
    .from(memoryTreeBuffers)
    .where(
      and(
        eq(memoryTreeBuffers.orgId, input.orgId),
        eq(memoryTreeBuffers.brandId, input.brandId),
        sql`${memoryTreeBuffers.scopeKey} like 'conv:%'`,
      ),
    );

  const [summarySourceRow] = await db
    .select({ count: sql<number>`count(distinct ${memorySummaries.scopeKey})` })
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
        sql`${memorySummaries.scopeKey} like 'conv:%'`,
      ),
    );

  const [topicRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memoryHotness)
    .where(
      and(
        eq(memoryHotness.orgId, input.orgId),
        eq(memoryHotness.brandId, input.brandId),
        eq(memoryHotness.entityType, "customer"),
      ),
    );

  const [hotTopicRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memoryHotness)
    .where(
      and(
        eq(memoryHotness.orgId, input.orgId),
        eq(memoryHotness.brandId, input.brandId),
        eq(memoryHotness.entityType, "customer"),
        sql`${memoryHotness.score} >= ${DEFAULT_HOTNESS_THRESHOLD}`,
      ),
    );

  const [topicBufferRow] = await db
    .select({ count: sql<number>`count(distinct ${memoryTreeBuffers.scopeKey})` })
    .from(memoryTreeBuffers)
    .where(
      and(
        eq(memoryTreeBuffers.orgId, input.orgId),
        eq(memoryTreeBuffers.brandId, input.brandId),
        sql`${memoryTreeBuffers.scopeKey} like 'customer:%'`,
      ),
    );

  const [channelSourceRow] = await db
    .select({ count: sql<number>`count(distinct ${memoryTreeBuffers.scopeKey})` })
    .from(memoryTreeBuffers)
    .where(
      and(
        eq(memoryTreeBuffers.orgId, input.orgId),
        eq(memoryTreeBuffers.brandId, input.brandId),
        sql`${memoryTreeBuffers.scopeKey} like 'channel:%'`,
      ),
    );

  const [channelSummaryRow] = await db
    .select({ count: sql<number>`count(distinct ${memorySummaries.scopeKey})` })
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
        sql`${memorySummaries.scopeKey} like 'channel:%'`,
      ),
    );

  const convSourceCount = Math.max(
    Number(sourceRow?.count ?? 0),
    Number(summarySourceRow?.count ?? 0),
  );
  const channelSourceCount = Math.max(
    Number(channelSourceRow?.count ?? 0),
    Number(channelSummaryRow?.count ?? 0),
  );
  const sourceCount = convSourceCount + channelSourceCount;
  const topicCount = Math.max(Number(topicRow?.count ?? 0), Number(topicBufferRow?.count ?? 0));

  return {
    brandId: input.brandId,
    chunkCount: Number(chunkRow?.count ?? 0),
    sourceCount,
    topicCount,
    hotTopicCount: Number(hotTopicRow?.count ?? 0),
    storageBytes: Number(chunkRow?.bytes ?? 0),
  };
}

function inferHitScope(metadata: Record<string, unknown>): MemorySearchHit["scope"] {
  if (typeof metadata.channelType === "string" && isChannelScopedTreeType(metadata.channelType)) {
    return "channel";
  }
  if (typeof metadata.conversationId === "string") return "conversation";
  if (typeof metadata.userId === "string") return "customer";
  return "unknown";
}

function rowToSearchHit(
  row: typeof memoryChunks.$inferSelect,
  fts?: { score: number; snippet?: string },
): MemorySearchHit {
  const metadata = row.metadata ?? {};
  const conversationId =
    typeof metadata.conversationId === "string" ? metadata.conversationId : null;
  const userId = typeof metadata.userId === "string" ? metadata.userId : null;

  return {
    chunkId: row.id,
    scope: inferHitScope(metadata),
    conversationId,
    messageId: messageIdFromChunk({
      sourceRef: row.sourceRef,
      metadata,
    }),
    userId,
    body: extractBodyFromCanonicalMd(row.bodyMd),
    lifecycle: row.lifecycle,
    fastScore: row.fastScore ?? null,
    ftsScore: fts?.score ?? null,
    snippet: fts?.snippet ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function scopeRestrictedChunkIds(
  db: KeenaiDb,
  input: { orgId: string; brandId: string },
  scope: "all" | "conversation" | "customer" | "channel",
): Promise<Set<string> | null> {
  if (scope === "all" || scope === "conversation") return null;

  const buffers = await db
    .select({ leafIds: memoryTreeBuffers.leafIds })
    .from(memoryTreeBuffers)
    .where(
      and(
        eq(memoryTreeBuffers.orgId, input.orgId),
        eq(memoryTreeBuffers.brandId, input.brandId),
        scope === "customer"
          ? sql`${memoryTreeBuffers.scopeKey} like 'customer:%'`
          : sql`${memoryTreeBuffers.scopeKey} like 'channel:%'`,
      ),
    );

  return new Set(buffers.flatMap((row) => row.leafIds));
}

async function searchMemoryChunksWithFts(
  db: KeenaiDb,
  input: SearchMemoryChunksInput & { chunkFts: Pick<FTSStore, "search"> },
): Promise<SearchMemoryChunksResult> {
  const q = input.q.trim();
  const scope = input.scope ?? "all";
  const limit = input.limit ?? 20;

  const scopeIds = await scopeRestrictedChunkIds(db, input, scope);
  if (scopeIds && scopeIds.size === 0) {
    return { q, scope, hits: [] };
  }

  const ftsHits = await input.chunkFts.search({
    orgId: input.orgId,
    brandId: input.brandId,
    q,
    limit: Math.min(Math.max(limit * 10, limit), 100),
  });

  if (ftsHits.length === 0) {
    return { q, scope, hits: [] };
  }

  const orderedIds = ftsHits
    .filter((hit) => !scopeIds || scopeIds.has(hit.id))
    .map((hit) => hit.id);

  if (orderedIds.length === 0) {
    return { q, scope, hits: [] };
  }

  const rows = await db
    .select()
    .from(memoryChunks)
    .where(
      and(
        eq(memoryChunks.orgId, input.orgId),
        eq(memoryChunks.brandId, input.brandId),
        inArray(memoryChunks.id, orderedIds),
      ),
    );

  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const ftsMap = new Map(ftsHits.map((hit) => [hit.id, hit]));

  const hits: MemorySearchHit[] = [];
  for (const id of orderedIds) {
    if (hits.length >= limit) break;
    const row = rowMap.get(id);
    if (!row) continue;

    const metadata = row.metadata ?? {};
    if (scope === "conversation" && typeof metadata.conversationId !== "string") {
      continue;
    }

    const ftsHit = ftsMap.get(id);
    hits.push(
      rowToSearchHit(row, ftsHit ? { score: ftsHit.score, snippet: ftsHit.snippet } : undefined),
    );
  }

  return { q, scope, hits };
}

/** Search memory chunks via FTS5 (preferred) or SQL LIKE fallback. */
export async function searchMemoryChunks(
  db: KeenaiDb,
  input: SearchMemoryChunksInput,
): Promise<SearchMemoryChunksResult> {
  const q = input.q.trim();
  const scope = input.scope ?? "all";
  const limit = input.limit ?? 20;

  if (q.length === 0) {
    return { q, scope, hits: [] };
  }

  if (input.chunkFts) {
    return searchMemoryChunksWithFts(db, { ...input, chunkFts: input.chunkFts });
  }

  const pattern = `%${escapeLikePattern(q)}%`;
  const filters = [
    eq(memoryChunks.orgId, input.orgId),
    eq(memoryChunks.brandId, input.brandId),
    sql`lower(${memoryChunks.bodyMd}) like lower(${pattern})`,
  ];

  if (scope === "conversation") {
    filters.push(sql`json_extract(${memoryChunks.metadata}, '$.conversationId') is not null`);
  }

  if (scope === "customer") {
    const customerBuffers = await db
      .select({ leafIds: memoryTreeBuffers.leafIds })
      .from(memoryTreeBuffers)
      .where(
        and(
          eq(memoryTreeBuffers.orgId, input.orgId),
          eq(memoryTreeBuffers.brandId, input.brandId),
          sql`${memoryTreeBuffers.scopeKey} like 'customer:%'`,
        ),
      );

    const customerChunkIds = [...new Set(customerBuffers.flatMap((row) => row.leafIds))];
    if (customerChunkIds.length === 0) {
      return { q, scope, hits: [] };
    }
    filters.push(inArray(memoryChunks.id, customerChunkIds));
  }

  if (scope === "channel") {
    const channelBuffers = await db
      .select({ leafIds: memoryTreeBuffers.leafIds })
      .from(memoryTreeBuffers)
      .where(
        and(
          eq(memoryTreeBuffers.orgId, input.orgId),
          eq(memoryTreeBuffers.brandId, input.brandId),
          sql`${memoryTreeBuffers.scopeKey} like 'channel:%'`,
        ),
      );

    const channelChunkIds = [...new Set(channelBuffers.flatMap((row) => row.leafIds))];
    if (channelChunkIds.length === 0) {
      return { q, scope, hits: [] };
    }
    filters.push(inArray(memoryChunks.id, channelChunkIds));
  }

  const rows = await db
    .select()
    .from(memoryChunks)
    .where(and(...filters))
    .orderBy(sql`${memoryChunks.createdAt} desc`)
    .limit(limit);

  const hits: MemorySearchHit[] = rows.map((row) => rowToSearchHit(row));

  return { q, scope, hits };
}

export type MemoryExplorerHotTopic = {
  userId: string;
  score: number;
  messageCount7d: number;
  openTicketCount: number;
};

/** List hot customer topics for explorer sidebar. */
export async function listHotTopics(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; limit?: number },
): Promise<MemoryExplorerHotTopic[]> {
  const rows = await db
    .select()
    .from(memoryHotness)
    .where(
      and(
        eq(memoryHotness.orgId, input.orgId),
        eq(memoryHotness.brandId, input.brandId),
        eq(memoryHotness.entityType, "customer"),
        sql`${memoryHotness.score} >= ${DEFAULT_HOTNESS_THRESHOLD}`,
      ),
    )
    .orderBy(sql`${memoryHotness.score} desc`)
    .limit(input.limit ?? 10);

  return rows.map((row) => ({
    userId: row.entityId,
    score: row.score,
    messageCount7d: row.signals.messageCount7d,
    openTicketCount: row.signals.openTicketCount,
  }));
}

export function scopeKeyLabel(scopeKey: string): string {
  const conversationId = conversationIdFromScopeKey(scopeKey);
  if (conversationId) return `Conversation ${conversationId.slice(0, 8)}…`;
  const customerId = customerIdFromScopeKey(scopeKey);
  if (customerId) return `Customer ${customerId.slice(0, 8)}…`;
  const channel = parseChannelScopeKey(scopeKey);
  if (channel) return `${channel.channelType} ${channel.channelId.slice(0, 8)}…`;
  return scopeKey;
}
