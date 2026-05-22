import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  assembleMemoryContext,
  digestDailyForBrand,
  ingestConversationMessage,
  processAdmittedChunk,
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

describe("memory-tree assemble context", () => {
  it("assembles conversation and brand_daily scopes", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "asm", name: "Asm" }).returning();
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
        channelId: "asm",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const msgRow = await db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conv.id,
        senderType: "user",
        plainText: "Need help with billing.",
        content: { type: "text", text: "Need help with billing." },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date("2026-05-25T10:00:00.000Z"),
      plainText: "Need help with billing.",
      isInternal: false,
    });
    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText: "Need help with billing.",
      source: "conversation_message",
      senderType: "user",
    });
    await processAdmittedChunk(db, {
      orgId: org.id,
      brandId: brand.id,
      chunkId: ingest.id,
    });

    const conversationContext = await assembleMemoryContext(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
    });
    expect(conversationContext.scope).toBe("conversation");
    expect(conversationContext.applied).toBe(true);
    expect(conversationContext.text).toContain("billing");

    const dateUtc = "2026-05-25";
    await db
      .update(memoryChunks)
      .set({ createdAt: new Date(`${dateUtc}T10:00:00.000Z`), lifecycle: "admitted" })
      .where(eq(memoryChunks.id, ingest.id));
    await digestDailyForBrand(db, { orgId: org.id, brandId: brand.id, dateUtc });

    const dailyContext = await assembleMemoryContext(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      instruction: "今天 support 概况",
      dateUtc,
    });
    expect(dailyContext.scope).toBe("brand_daily");
    expect(dailyContext.text).toContain("Brand daily digest");

    const kbContext = await assembleMemoryContext(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      instruction: "产品怎么用？",
    });
    expect(kbContext.scope).toBe("kb_only");
    expect(kbContext.applied).toBe(false);

    await store.close();
  });
});
