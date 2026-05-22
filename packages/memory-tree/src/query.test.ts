import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  digestDailyForBrand,
  ingestConversationMessage,
  processAdmittedChunk,
  queryBrandDailyDigest,
  queryConversationMemoryTree,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  conversations,
  memoryChunks,
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

describe("memory-tree query", () => {
  it("queries conversation latest and brand daily digest", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "q", name: "Query" }).returning();
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
        channelId: "query",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const dateUtc = "2026-05-24";
    const texts = ["Billing question.", "Follow-up on ORD-42.", "Thanks for the update."];
    for (let i = 0; i < texts.length; i++) {
      const msgRow = await db
        .insert(messages)
        .values({
          orgId: org.id,
          conversationId: conv.id,
          senderType: "user",
          plainText: texts[i] ?? "",
          content: { type: "text", text: texts[i] ?? "" },
        })
        .returning();
      const msg = requireRow(msgRow[0], "message");
      const ingest = await ingestConversationMessage(db, {
        orgId: org.id,
        brandId: brand.id,
        conversationId: conv.id,
        messageId: msg.id,
        senderType: "user",
        sentAt: new Date(`${dateUtc}T11:0${i}:00.000Z`),
        plainText: texts[i] ?? "",
        isInternal: false,
      });
      await applyFastScoreToChunk(db, {
        chunkId: ingest.id,
        plainText: texts[i] ?? "",
        source: "conversation_message",
        senderType: "user",
      });
      await processAdmittedChunk(db, {
        orgId: org.id,
        brandId: brand.id,
        chunkId: ingest.id,
        config: { maxLeaves: 3, maxTokens: 10_000 },
      });
    }

    const latest = await queryConversationMemoryTree(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      mode: "latest",
    });
    expect(latest.levels).toHaveLength(1);

    const drillDown = await queryConversationMemoryTree(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      mode: "drill_down",
      level: 1,
    });
    expect(drillDown.levels[0]?.nodes.some((node) => node.kind === "summary")).toBe(true);

    const chunkRow = await db.select().from(memoryChunks).where(eq(memoryChunks.orgId, org.id));
    for (const chunk of chunkRow) {
      await db
        .update(memoryChunks)
        .set({ createdAt: new Date(`${dateUtc}T12:00:00.000Z`) })
        .where(eq(memoryChunks.id, chunk.id));
    }

    await digestDailyForBrand(db, { orgId: org.id, brandId: brand.id, dateUtc });
    const digest = await queryBrandDailyDigest(db, {
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(digest?.scope).toBe("brand_daily");
    expect(digest?.summary).toContain("Billing question");

    await store.close();
  });
});
