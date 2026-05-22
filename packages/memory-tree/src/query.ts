import type { KeenaiDb } from "@keenai/storage";
import {
  type MemorySummaryProvenance,
  memoryChunks,
  memoryEpisodes,
  memorySummaries,
  memoryTreeBuffers,
} from "@keenai/storage/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { extractBodyFromCanonicalMd, messageIdFromChunk } from "./canonical-body.js";
import { brandDailyScopeKey, conversationScopeKey } from "./scope-key.js";

export type MemoryTreeLeafNode = {
  kind: "leaf";
  chunkId: string;
  messageId: string | null;
  body: string;
  lifecycle: string;
  fastScore: number | null;
  createdAt: string;
};

export type MemoryTreeSummaryNode = {
  kind: "summary";
  summaryId: string;
  title: string | null;
  summary: string;
  provenance: MemorySummaryProvenance;
  sealedAt: string;
};

export type MemoryTreeEpisodeNode = {
  kind: "episode";
  episodeId: string;
  summary: string;
  topic: string | null;
  startsAt: string | null;
  endsAt: string | null;
  metadata: Record<string, unknown>;
};

export type MemoryTreeNode = MemoryTreeLeafNode | MemoryTreeSummaryNode | MemoryTreeEpisodeNode;

export type MemoryTreeLevel = {
  level: number;
  nodes: MemoryTreeNode[];
};

export type QueryConversationMemoryTreeInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  mode: "latest" | "drill_down";
  level?: number;
};

export type ConversationMemoryTreeResult = {
  scope: "conversation";
  scopeKey: string;
  conversationId: string;
  mode: "latest" | "drill_down";
  levels: MemoryTreeLevel[];
};

function serializeLeaf(chunk: typeof memoryChunks.$inferSelect): MemoryTreeLeafNode {
  return {
    kind: "leaf",
    chunkId: chunk.id,
    messageId: messageIdFromChunk({
      sourceRef: chunk.sourceRef,
      metadata: chunk.metadata,
    }),
    body: extractBodyFromCanonicalMd(chunk.bodyMd),
    lifecycle: chunk.lifecycle,
    fastScore: chunk.fastScore ?? null,
    createdAt: chunk.createdAt.toISOString(),
  };
}

async function loadBufferLeaves(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; scopeKey: string },
): Promise<MemoryTreeLeafNode[]> {
  const [buffer] = await db
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

  if (!buffer || buffer.leafIds.length === 0) return [];

  const rows = await db
    .select()
    .from(memoryChunks)
    .where(and(eq(memoryChunks.orgId, input.orgId), inArray(memoryChunks.id, buffer.leafIds)));

  const byId = new Map(rows.map((row) => [row.id, row]));
  return buffer.leafIds
    .map((id) => byId.get(id))
    .filter((row): row is (typeof rows)[number] => Boolean(row))
    .map(serializeLeaf);
}

/** Query conversation source tree (L0 buffer and optional drill-down summaries). */
export async function queryConversationMemoryTree(
  db: KeenaiDb,
  input: QueryConversationMemoryTreeInput,
): Promise<ConversationMemoryTreeResult> {
  const scopeKey = conversationScopeKey(input.conversationId);
  const levels: MemoryTreeLevel[] = [];
  const includeLevel = (level: number) => input.level === undefined || input.level === level;

  if (includeLevel(0)) {
    const leaves = await loadBufferLeaves(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      scopeKey,
    });
    levels.push({ level: 0, nodes: leaves });
  }

  if (input.mode === "drill_down") {
    if (includeLevel(1)) {
      const summaries = await db
        .select()
        .from(memorySummaries)
        .where(
          and(
            eq(memorySummaries.orgId, input.orgId),
            eq(memorySummaries.brandId, input.brandId),
            eq(memorySummaries.scopeKey, scopeKey),
            eq(memorySummaries.level, 1),
          ),
        )
        .orderBy(desc(memorySummaries.sealedAt));

      const summaryNodes: MemoryTreeSummaryNode[] = summaries.map((row) => ({
        kind: "summary",
        summaryId: row.id,
        title: row.title,
        summary: row.summary,
        provenance: row.provenance,
        sealedAt: row.sealedAt.toISOString(),
      }));

      const episodes = await db
        .select()
        .from(memoryEpisodes)
        .where(
          and(
            eq(memoryEpisodes.orgId, input.orgId),
            eq(memoryEpisodes.scope, "conversation"),
            eq(memoryEpisodes.scopeId, input.conversationId),
          ),
        )
        .orderBy(desc(memoryEpisodes.endsAt));

      const episodeNodes: MemoryTreeEpisodeNode[] = episodes.map((row) => ({
        kind: "episode",
        episodeId: row.id,
        summary: row.summary,
        topic: row.topic,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        metadata: row.metadata,
      }));

      levels.push({ level: 1, nodes: [...summaryNodes, ...episodeNodes] });
    }
  }

  return {
    scope: "conversation",
    scopeKey,
    conversationId: input.conversationId,
    mode: input.mode,
    levels,
  };
}

export type QueryBrandDailyDigestInput = {
  orgId: string;
  brandId: string;
  dateUtc: string;
};

export type BrandDailyDigestResult = {
  scope: "brand_daily";
  scopeKey: string;
  brandId: string;
  dateUtc: string;
  summaryId: string;
  episodeId: string | null;
  title: string | null;
  summary: string;
  keyEvents: string[];
  provenance: MemorySummaryProvenance;
  sealedAt: string;
};

/** Fetch a brand daily digest node for a UTC date. */
export async function queryBrandDailyDigest(
  db: KeenaiDb,
  input: QueryBrandDailyDigestInput,
): Promise<BrandDailyDigestResult | null> {
  const scopeKey = brandDailyScopeKey(input.brandId, input.dateUtc);

  const [summary] = await db
    .select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
        eq(memorySummaries.scopeKey, scopeKey),
        eq(memorySummaries.level, 0),
      ),
    )
    .orderBy(desc(memorySummaries.sealedAt))
    .limit(1);

  if (!summary) return null;

  const episodeScopeId = `${input.brandId}:${input.dateUtc}`;
  const [episode] = await db
    .select()
    .from(memoryEpisodes)
    .where(
      and(
        eq(memoryEpisodes.orgId, input.orgId),
        eq(memoryEpisodes.scope, "brand_daily"),
        eq(memoryEpisodes.scopeId, episodeScopeId),
      ),
    )
    .limit(1);

  return {
    scope: "brand_daily",
    scopeKey,
    brandId: input.brandId,
    dateUtc: input.dateUtc,
    summaryId: summary.id,
    episodeId: episode?.id ?? null,
    title: summary.title,
    summary: summary.summary,
    keyEvents: summary.provenance.keyEvents ?? [],
    provenance: summary.provenance,
    sealedAt: summary.sealedAt.toISOString(),
  };
}
