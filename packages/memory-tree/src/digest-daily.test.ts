import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  brandDailyScopeKey,
  digestDailyForBrand,
  ingestConversationMessage,
  runDigestDaily,
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

describe("memory-tree digest_daily", () => {
  it("creates a global daily summary and brand_daily episode", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "dig", name: "Digest" })
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
        channelId: "digest",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const dateUtc = "2026-05-21";
    const texts = [
      "Customer asked about upgrading to Pro.",
      "Shared order ORD-9988 for billing review.",
    ];

    for (let i = 0; i < texts.length; i++) {
      const msgRow = await db
        .insert(messages)
        .values({
          orgId: org.id,
          conversationId: conv.id,
          senderType: "user",
          plainText: texts[i] ?? "",
          content: { type: "text", text: texts[i] ?? "" },
          createdAt: new Date(`${dateUtc}T1${i}:00:00.000Z`),
        })
        .returning();
      const msg = requireRow(msgRow[0], "message");

      const ingest = await ingestConversationMessage(db, {
        orgId: org.id,
        brandId: brand.id,
        conversationId: conv.id,
        messageId: msg.id,
        senderType: "user",
        sentAt: new Date(`${dateUtc}T1${i}:00:00.000Z`),
        plainText: texts[i] ?? "",
        isInternal: false,
      });

      await applyFastScoreToChunk(db, {
        chunkId: ingest.id,
        plainText: texts[i] ?? "",
        source: "conversation_message",
        senderType: "user",
      });

      await db
        .update(memoryChunks)
        .set({ createdAt: new Date(`${dateUtc}T1${i}:00:00.000Z`) })
        .where(eq(memoryChunks.id, ingest.id));
    }

    const first = await digestDailyForBrand(db, {
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(first.created).toBe(true);
    expect(first.chunkCount).toBe(2);
    expect(first.scopeKey).toBe(brandDailyScopeKey(brand.id, dateUtc));

    const second = await digestDailyForBrand(db, {
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(second.created).toBe(false);
    expect(second.reason).toBe("already_digested");

    const summaries = await db
      .select()
      .from(memorySummaries)
      .where(eq(memorySummaries.orgId, org.id));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.level).toBe(0);
    expect(summaries[0]?.summary).toContain("upgrading to Pro");

    const episodes = await db.select().from(memoryEpisodes).where(eq(memoryEpisodes.orgId, org.id));
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.scope).toBe("brand_daily");
    expect(episodes[0]?.scopeId).toBe(`${brand.id}:${dateUtc}`);

    const run = await runDigestDaily(db, { orgId: org.id, brandId: brand.id, dateUtc });
    expect(run.brandsProcessed).toBe(1);
    expect(run.digestsCreated).toBe(0);

    await store.close();
  });

  it("skips dropped chunks for the daily digest", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "dig2", name: "Digest 2" })
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
        channelId: "digest2",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const dateUtc = "2026-05-22";
    const msgRow = await db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conv.id,
        senderType: "user",
        plainText: "谢谢",
        content: { type: "text", text: "谢谢" },
        createdAt: new Date(`${dateUtc}T12:00:00.000Z`),
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date(`${dateUtc}T12:00:00.000Z`),
      plainText: "谢谢",
      isInternal: false,
    });

    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText: "谢谢",
      source: "conversation_message",
      senderType: "user",
    });

    await db
      .update(memoryChunks)
      .set({ createdAt: new Date(`${dateUtc}T12:00:00.000Z`) })
      .where(eq(memoryChunks.id, ingest.id));

    const [chunk] = await db.select().from(memoryChunks).where(eq(memoryChunks.id, ingest.id));
    expect(chunk?.lifecycle).toBe("dropped");

    const result = await digestDailyForBrand(db, {
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(result.created).toBe(false);
    expect(result.reason).toBe("no_chunks");

    await store.close();
  });
});
