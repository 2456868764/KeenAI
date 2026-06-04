import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEMORY_TREE_DIGEST_DAILY_EVENT,
  applyFastScoreToChunk,
  brandDailyScopeKey,
  brandDailyScopeKeyForDigest,
  ingestConversationMessage,
  normalizeBrandDailyDigestInput,
  runBrandDailyDigestForBrandStub,
  runBrandDailyDigestStub,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  conversations,
  memoryChunks,
  memoryEpisodes,
  memorySummaries,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("brand-daily-digest MT-04 stub", () => {
  it("exports digest_daily event and normalizes default UTC date", () => {
    expect(MEMORY_TREE_DIGEST_DAILY_EVENT).toBe("keenai/memory.digest_daily");
    const normalized = normalizeBrandDailyDigestInput({ orgId: "org1", brandId: "brand1" });
    expect(normalized.orgId).toBe("org1");
    expect(normalized.brandId).toBe("brand1");
    expect(normalized.dateUtc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(brandDailyScopeKeyForDigest("brand1", "2026-05-20")).toBe(
      brandDailyScopeKey("brand1", "2026-05-20"),
    );
  });

  it("creates brand daily summary and episode via stub runner", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "mt04", name: "MT04" })
      .returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");
    const convRow = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "mt04-digest",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const dateUtc = "2026-05-20";
    const plainText = "Need enterprise pricing for 50 seats on annual plan.";
    const msgRow = await db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conv.id,
        senderType: "user",
        plainText,
        content: { type: "text", text: plainText },
        createdAt: new Date(`${dateUtc}T14:00:00.000Z`),
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date(`${dateUtc}T14:00:00.000Z`),
      plainText,
      isInternal: false,
    });

    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText,
      source: "conversation_message",
      senderType: "user",
    });

    await db
      .update(memoryChunks)
      .set({ createdAt: new Date(`${dateUtc}T14:00:00.000Z`) })
      .where(eq(memoryChunks.id, ingest.id));

    const single = await runBrandDailyDigestForBrandStub(db, {
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(single.created).toBe(true);
    expect(single.scopeKey).toBe(brandDailyScopeKey(brand.id, dateUtc));

    const batch = await runBrandDailyDigestStub(db, { orgId: org.id, brandId: brand.id, dateUtc });
    expect(batch.digestsCreated).toBe(0);
    expect(batch.results[0]?.reason).toBe("already_digested");

    const summaries = await db
      .select()
      .from(memorySummaries)
      .where(eq(memorySummaries.orgId, org.id));
    expect(summaries).toHaveLength(1);

    const episodes = await db.select().from(memoryEpisodes).where(eq(memoryEpisodes.orgId, org.id));
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.scope).toBe("brand_daily");
  });
});
