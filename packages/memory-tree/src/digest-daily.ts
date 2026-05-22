import type { KeenaiDb } from "@keenai/storage";
import { brands, memoryChunks, memoryEpisodes, memorySummaries } from "@keenai/storage/schema";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { extractBodyFromCanonicalMd, messageIdFromChunk } from "./canonical-body.js";
import { brandDailyScopeKey } from "./scope-key.js";
import { stubDailyDigest } from "./stub-digest.js";
import { type MemorySummaryFtsIndexer, indexMemorySummaryInFts } from "./summary-fts-index.js";
import { defaultDigestDateUtc, utcDayRange } from "./utc-date.js";

const DIGESTABLE_LIFECYCLES = ["admitted", "buffered", "sealed"] as const;
const GLOBAL_DAILY_LEVEL = 0;

export type DigestDailyForBrandInput = {
  orgId: string;
  brandId: string;
  dateUtc: string;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export type DigestDailyForBrandResult = {
  orgId: string;
  brandId: string;
  dateUtc: string;
  scopeKey: string;
  created: boolean;
  summaryId?: string;
  episodeId?: string;
  chunkCount: number;
  reason?: string;
};

export type RunDigestDailyInput = {
  dateUtc?: string;
  orgId?: string;
  brandId?: string;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export type RunDigestDailyResult = {
  dateUtc: string;
  brandsProcessed: number;
  digestsCreated: number;
  results: DigestDailyForBrandResult[];
};

function conversationIdFromChunk(metadata: Record<string, unknown>): string | null {
  const value = metadata.conversationId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Build a global daily digest node for one brand + UTC day. */
export async function digestDailyForBrand(
  db: KeenaiDb,
  input: DigestDailyForBrandInput,
): Promise<DigestDailyForBrandResult> {
  const scopeKey = brandDailyScopeKey(input.brandId, input.dateUtc);
  const base = {
    orgId: input.orgId,
    brandId: input.brandId,
    dateUtc: input.dateUtc,
    scopeKey,
    created: false,
    chunkCount: 0,
  };

  const [existing] = await db
    .select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
        eq(memorySummaries.scopeKey, scopeKey),
        eq(memorySummaries.level, GLOBAL_DAILY_LEVEL),
      ),
    )
    .limit(1);

  if (existing) {
    return { ...base, reason: "already_digested" };
  }

  const { start, end } = utcDayRange(input.dateUtc);
  const chunkRows = await db
    .select()
    .from(memoryChunks)
    .where(
      and(
        eq(memoryChunks.orgId, input.orgId),
        eq(memoryChunks.brandId, input.brandId),
        inArray(memoryChunks.lifecycle, [...DIGESTABLE_LIFECYCLES]),
        gte(memoryChunks.createdAt, start),
        lt(memoryChunks.createdAt, end),
      ),
    )
    .orderBy(asc(memoryChunks.createdAt));

  if (chunkRows.length === 0) {
    return { ...base, reason: "no_chunks" };
  }

  const digest = stubDailyDigest({
    dateUtc: input.dateUtc,
    brandId: input.brandId,
    chunks: chunkRows.map((chunk) => ({
      id: chunk.id,
      body: extractBodyFromCanonicalMd(chunk.bodyMd),
      messageId: messageIdFromChunk({
        sourceRef: chunk.sourceRef,
        metadata: chunk.metadata,
      }),
      conversationId: conversationIdFromChunk(chunk.metadata),
      createdAt: chunk.createdAt,
    })),
  });

  const [summaryRow] = await db
    .insert(memorySummaries)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      scopeKey,
      level: GLOBAL_DAILY_LEVEL,
      title: digest.title,
      summary: digest.summary,
      provenance: {
        chunkIds: digest.chunkIds,
        messageIds: digest.messageIds,
        keyEvents: digest.keyEvents,
      },
    })
    .returning();

  if (!summaryRow) throw new Error("memory_daily_digest_create_failed");

  await indexMemorySummaryInFts(input.summaryFtsIndexer, {
    id: summaryRow.id,
    orgId: summaryRow.orgId,
    brandId: summaryRow.brandId,
    scopeKey: summaryRow.scopeKey,
    level: summaryRow.level,
    title: summaryRow.title,
    summary: summaryRow.summary,
  });

  const episodeScopeId = `${input.brandId}:${input.dateUtc}`;
  const [episodeRow] = await db
    .insert(memoryEpisodes)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      scope: "brand_daily",
      scopeId: episodeScopeId,
      summary: digest.summary,
      topic: digest.title,
      startsAt: digest.startsAt,
      endsAt: digest.endsAt,
      metadata: {
        summaryId: summaryRow.id,
        scopeKey,
        dateUtc: input.dateUtc,
        chunkIds: digest.chunkIds,
        messageIds: digest.messageIds,
        conversationIds: digest.conversationIds,
        keyEvents: digest.keyEvents,
      },
    })
    .returning();

  if (!episodeRow) throw new Error("memory_daily_episode_create_failed");

  return {
    ...base,
    created: true,
    summaryId: summaryRow.id,
    episodeId: episodeRow.id,
    chunkCount: digest.chunkIds.length,
  };
}

/** Run digest_daily for all brands or a filtered org/brand pair. */
export async function runDigestDaily(
  db: KeenaiDb,
  input: RunDigestDailyInput = {},
): Promise<RunDigestDailyResult> {
  const dateUtc = input.dateUtc ?? defaultDigestDateUtc();

  const filters = [];
  if (input.orgId) filters.push(eq(brands.orgId, input.orgId));
  if (input.brandId) filters.push(eq(brands.id, input.brandId));

  const brandRows =
    filters.length > 0
      ? await db
          .select()
          .from(brands)
          .where(filters.length === 1 ? filters[0] : and(...filters))
      : await db.select().from(brands);

  const results: DigestDailyForBrandResult[] = [];
  for (const brand of brandRows) {
    results.push(
      await digestDailyForBrand(db, {
        orgId: brand.orgId,
        brandId: brand.id,
        dateUtc,
        summaryFtsIndexer: input.summaryFtsIndexer,
      }),
    );
  }

  return {
    dateUtc,
    brandsProcessed: brandRows.length,
    digestsCreated: results.filter((row) => row.created).length,
    results,
  };
}
