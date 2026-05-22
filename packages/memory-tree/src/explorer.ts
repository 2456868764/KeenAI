import type { KeenaiDb } from "@keenai/storage";
import {
  memoryChunks,
  memoryHotness,
  memorySummaries,
  memoryTreeBuffers,
} from "@keenai/storage/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { extractBodyFromCanonicalMd, messageIdFromChunk } from "./canonical-body.js";
import { DEFAULT_HOTNESS_THRESHOLD } from "./hotness-config.js";
import { conversationIdFromScopeKey, customerIdFromScopeKey } from "./scope-key.js";

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
  scope?: "all" | "conversation" | "customer";
  limit?: number;
};

export type MemorySearchHit = {
  chunkId: string;
  scope: "conversation" | "customer" | "unknown";
  conversationId: string | null;
  messageId: string | null;
  userId: string | null;
  body: string;
  lifecycle: string;
  fastScore: number | null;
  createdAt: string;
};

export type SearchMemoryChunksResult = {
  q: string;
  scope: "all" | "conversation" | "customer";
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

  const sourceCount = Math.max(Number(sourceRow?.count ?? 0), Number(summarySourceRow?.count ?? 0));
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
  if (typeof metadata.conversationId === "string") return "conversation";
  if (typeof metadata.userId === "string") return "customer";
  return "unknown";
}

/** Search memory chunks by plain-text body (Memory Explorer MVP). */
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

  const rows = await db
    .select()
    .from(memoryChunks)
    .where(and(...filters))
    .orderBy(sql`${memoryChunks.createdAt} desc`)
    .limit(limit);

  const hits: MemorySearchHit[] = rows.map((row) => {
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
      createdAt: row.createdAt.toISOString(),
    };
  });

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
  return scopeKey;
}
