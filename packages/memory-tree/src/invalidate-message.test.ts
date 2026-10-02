import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLibsqlMemoryChunkFtsStore,
  createLibsqlMemoryChunkVectorStore,
  createLibsqlMemorySummaryFtsStore,
  createLibsqlStore,
} from "@keenai/storage";
import {
  brands,
  conversations,
  memoryChunks,
  memoryEpisodes,
  memoryFacts,
  memorySlots,
  memorySummaries,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createStubMemoryChunkEmbedder } from "./embed/stub-embedder.js";
import { ingestConversationMessage } from "./ingest.js";
import { invalidateConversationMessageMemory } from "./invalidate-message.js";
import { processAdmittedChunk } from "./process-admitted-chunk.js";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("invalidateConversationMessageMemory", () => {
  it("removes retrievable projections and allows an edited message to be rebuilt", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "invalidate-memory", name: "Invalidate Memory" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: requireRow(org, "org").id, slug: "default", name: "Default" })
      .returning();
    const [conversation] = await db
      .insert(conversations)
      .values({
        orgId: requireRow(org, "org").id,
        brandId: requireRow(brand, "brand").id,
        channelType: "telegram",
        channelId: "chat-1",
        status: "open",
      })
      .returning();
    const [message] = await db
      .insert(messages)
      .values({
        orgId: requireRow(org, "org").id,
        conversationId: requireRow(conversation, "conversation").id,
        senderType: "user",
        plainText: "obsolete refund instructions",
        content: { type: "text", text: "obsolete refund instructions" },
      })
      .returning();

    const chunkFts = createLibsqlMemoryChunkFtsStore(store.client);
    const summaryFts = createLibsqlMemorySummaryFtsStore(store.client);
    const vectors = createLibsqlMemoryChunkVectorStore(store.client);
    const embedder = createStubMemoryChunkEmbedder(16);
    const source = {
      orgId: requireRow(org, "org").id,
      brandId: requireRow(brand, "brand").id,
      conversationId: requireRow(conversation, "conversation").id,
      messageId: requireRow(message, "message").id,
      senderType: "user",
      sentAt: new Date("2026-09-23T12:00:00.000Z"),
      plainText: "obsolete refund instructions",
      isInternal: false,
    };
    const ingested = await ingestConversationMessage(db, {
      ...source,
      ftsIndexer: chunkFts,
      chunkEmbedder: embedder,
      chunkVectorStore: vectors,
    });
    const processed = await processAdmittedChunk(db, {
      orgId: source.orgId,
      brandId: source.brandId,
      chunkId: ingested.id,
      config: { maxLeaves: 1 },
      summaryFtsIndexer: summaryFts,
    });
    const summaryId = requireRow(processed.summaryId, "summary");
    const [fact] = await db
      .insert(memoryFacts)
      .values({
        orgId: source.orgId,
        brandId: source.brandId,
        scope: "conversation",
        scopeId: source.conversationId,
        predicate: "refund.policy",
        object: "obsolete",
        summaryId,
      })
      .returning();
    await db.insert(memorySlots).values({
      orgId: source.orgId,
      brandId: source.brandId,
      scope: "conversation",
      scopeId: source.conversationId,
      key: "refund.policy",
      value: "obsolete",
      source: `summary:${summaryId}`,
    });

    const result = await invalidateConversationMessageMemory(db, {
      orgId: source.orgId,
      brandId: source.brandId,
      messageId: source.messageId,
      chunkFts,
      chunkVectorStore: vectors,
      summaryFts,
    });

    expect(result.chunkIds).toEqual([ingested.id]);
    expect(result.summaryIds).toEqual([summaryId]);
    expect(result.archivedFactIds).toEqual([requireRow(fact, "fact").id]);
    expect(await db.select().from(memoryChunks)).toHaveLength(0);
    expect(await db.select().from(memorySummaries)).toHaveLength(0);
    expect(await db.select().from(memoryEpisodes)).toHaveLength(0);
    expect(await db.select().from(memorySlots)).toHaveLength(0);
    const [archivedFact] = await db
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.id, requireRow(fact, "fact").id));
    expect(archivedFact?.status).toBe("archived");
    expect(archivedFact?.archivedAt).toBeInstanceOf(Date);
    expect(
      await chunkFts.search({ orgId: source.orgId, brandId: source.brandId, q: "obsolete" }),
    ).toHaveLength(0);
    expect(
      await summaryFts.search({
        orgId: source.orgId,
        brandId: source.brandId,
        q: "obsolete",
      }),
    ).toHaveLength(0);
    expect(
      await vectors.query({
        orgId: source.orgId,
        brandId: source.brandId,
        embedding: await embedder.embed("obsolete refund"),
      }),
    ).toHaveLength(0);

    const rebuilt = await ingestConversationMessage(db, {
      ...source,
      plainText: "current return instructions",
      ftsIndexer: chunkFts,
      chunkEmbedder: embedder,
      chunkVectorStore: vectors,
    });
    expect(rebuilt.created).toBe(true);
    expect(rebuilt.id).not.toBe(ingested.id);
    expect(
      await chunkFts.search({ orgId: source.orgId, brandId: source.brandId, q: "current" }),
    ).toHaveLength(1);

    await store.close();
  });
});
