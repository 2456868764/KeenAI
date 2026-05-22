import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationScopeKey,
  extractFactsFromSummary,
  ingestConversationMessage,
  processAdmittedChunk,
  searchMemoryChunks,
} from "@keenai/memory-tree";
import {
  createLibsqlMemoryChunkFtsStore,
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
  memoryTreeBuffers,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("memory-tree buffer + seal", () => {
  it("seals conv buffer into summary and episode when full", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });
    const summaryFts = createLibsqlMemorySummaryFtsStore(store.client);
    const chunkFts = createLibsqlMemoryChunkFtsStore(store.client);

    const orgRow = await db.insert(organizations).values({ slug: "buf", name: "Buf" }).returning();
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
        channelId: "buf-tree",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const texts = [
      "I need help upgrading my plan to Pro.",
      "My order ORD-12345 is still pending.",
      "Can you confirm support@acme.com got the invoice?",
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
        })
        .returning();
      const msg = requireRow(msgRow[0], "message");

      await ingestConversationMessage(db, {
        orgId: org.id,
        brandId: brand.id,
        conversationId: conv.id,
        messageId: msg.id,
        senderType: "user",
        sentAt: new Date(`2026-05-21T10:0${i}:00.000Z`),
        plainText: texts[i] ?? "",
        isInternal: false,
      });

      await processAdmittedChunk(db, {
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
        summaryFtsIndexer: summaryFts,
      });
    }

    const scopeKey = conversationScopeKey(conv.id);
    const [buffer] = await db
      .select()
      .from(memoryTreeBuffers)
      .where(and(eq(memoryTreeBuffers.orgId, org.id), eq(memoryTreeBuffers.scopeKey, scopeKey)));
    expect(buffer?.leafIds).toEqual([]);

    const chunks = await db.select().from(memoryChunks).where(eq(memoryChunks.orgId, org.id));
    expect(chunks.every((chunk) => chunk.lifecycle === "sealed")).toBe(true);

    const summaries = await db
      .select()
      .from(memorySummaries)
      .where(eq(memorySummaries.orgId, org.id));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.provenance.chunkIds).toHaveLength(3);

    const episodes = await db.select().from(memoryEpisodes).where(eq(memoryEpisodes.orgId, org.id));
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.scope).toBe("conversation");
    expect(episodes[0]?.scopeId).toBe(conv.id);

    const summary = requireRow(summaries[0], "summary");
    const factsResult = await extractFactsFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
    });
    expect(factsResult.extracted).toBe(true);

    const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.orgId, org.id));
    expect(facts.length).toBeGreaterThan(0);
    const slots = await db.select().from(memorySlots).where(eq(memorySlots.orgId, org.id));
    expect(slots.length).toBeGreaterThan(0);

    const search = await searchMemoryChunks(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "invoice",
      scope: "conversation",
      chunkFts,
      summaryFts,
    });
    expect(search.summaryHits.length).toBeGreaterThan(0);
    expect(search.summaryHits[0]?.kind).toBe("seal");

    await store.close();
  });
});
