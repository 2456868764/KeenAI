import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  assembleMemoryContext,
  digestDailyForBrand,
  extractFactsFromSummary,
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

  it("assembles customer topic scope when user is hot", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "cus", name: "Cus" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");
    const userId = "user_ctx_hot";
    const convRow = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId,
        channelType: "messenger",
        channelId: "cus-ctx",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    for (const text of ["Prior billing question.", "Follow-up on refund."]) {
      const msgRow = await db
        .insert(messages)
        .values({
          orgId: org.id,
          conversationId: conv.id,
          senderType: "user",
          plainText: text,
          content: { type: "text", text },
        })
        .returning();
      const msg = requireRow(msgRow[0], "message");
      const ingest = await ingestConversationMessage(db, {
        orgId: org.id,
        brandId: brand.id,
        conversationId: conv.id,
        messageId: msg.id,
        senderType: "user",
        sentAt: new Date("2026-05-27T10:00:00.000Z"),
        plainText: text,
        isInternal: false,
      });
      await applyFastScoreToChunk(db, {
        chunkId: ingest.id,
        plainText: text,
        source: "conversation_message",
        senderType: "user",
      });
      await processAdmittedChunk(db, {
        orgId: org.id,
        brandId: brand.id,
        chunkId: ingest.id,
      });
    }

    const customerContext = await assembleMemoryContext(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      userId,
      instruction: "这个客户之前说过什么？",
    });
    expect(customerContext.scope).toBe("customer");
    expect(customerContext.applied).toBe(true);
    expect(customerContext.text).toContain("Customer topic buffer");

    await store.close();
  });

  it("includes L3 facts and slots in conversation context", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "l3", name: "L3" }).returning();
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
        channelId: "l3",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const texts = [
      "I need help upgrading my plan to Pro.",
      "My order ORD-55555 is still pending.",
      "Can you confirm support@acme.com got the invoice?",
    ];
    let summaryId: string | undefined;
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
      await ingestConversationMessage(db, {
        orgId: org.id,
        brandId: brand.id,
        conversationId: conv.id,
        messageId: msg.id,
        senderType: "user",
        sentAt: new Date(`2026-05-26T10:0${i}:00.000Z`),
        plainText: texts[i] ?? "",
        isInternal: false,
      });
      const admitted = await processAdmittedChunk(db, {
        orgId: org.id,
        brandId: brand.id,
        chunkId: requireRow(
          (
            await db
              .select()
              .from(memoryChunks)
              .where(eq(memoryChunks.sourceRef, `message:${msg.id}`))
          )[0],
          "chunk",
        ).id,
        config: { maxLeaves: 3, maxTokens: 10_000 },
      });
      if (admitted.summaryId) summaryId = admitted.summaryId;
    }

    await extractFactsFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: requireRow(summaryId, "summaryId"),
    });

    const context = await assembleMemoryContext(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
    });

    expect(context.text).toContain("Semantic memory (L3");
    expect(context.text).toContain("contact_email");
    expect(context.sections.some((section) => section.title.includes("L3"))).toBe(true);

    await store.close();
  });
});
