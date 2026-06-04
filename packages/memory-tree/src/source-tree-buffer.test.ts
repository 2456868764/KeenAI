import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationScopeKey,
  conversationScopeKeyFromChunk,
  ingestConversationMessage,
  runSourceTreeBufferSealStub,
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

describe("source-tree-buffer MT-03 stub", () => {
  it("resolves conv scope key from chunk metadata", () => {
    expect(conversationScopeKeyFromChunk({ conversationId: "conv_abc" })).toBe(
      conversationScopeKey("conv_abc"),
    );
    expect(conversationScopeKeyFromChunk({})).toBeNull();
    expect(conversationScopeKeyFromChunk(null)).toBeNull();
  });

  it("seals conv buffer into summary and episode when full", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "mt03", name: "MT03" })
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
        channelId: "mt03-tree",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const texts = [
      "Need help upgrading to Pro plan.",
      "Order ORD-777 is still pending.",
      "Please confirm invoice was sent.",
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
        sentAt: new Date(`2026-05-21T11:0${i}:00.000Z`),
        plainText: texts[i] ?? "",
        isInternal: false,
      });

      const chunk = requireRow(
        (
          await db
            .select()
            .from(memoryChunks)
            .where(eq(memoryChunks.sourceRef, `message:${msg.id}`))
        )[0],
        "chunk",
      );

      const result = await runSourceTreeBufferSealStub(db, {
        orgId: org.id,
        brandId: brand.id,
        chunkId: chunk.id,
        config: { maxLeaves: 3, maxTokens: 10_000 },
      });

      expect(result.extracted).toBe(true);
      expect(result.scopeKey).toBe(conversationScopeKey(conv.id));
      if (i < 2) {
        expect(result.appended).toBe(true);
        expect(result.sealed).toBe(false);
      }
    }

    const summaries = await db
      .select()
      .from(memorySummaries)
      .where(eq(memorySummaries.orgId, org.id));
    expect(summaries).toHaveLength(1);

    const episodes = await db.select().from(memoryEpisodes).where(eq(memoryEpisodes.orgId, org.id));
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.scope).toBe("conversation");
    expect(episodes[0]?.scopeId).toBe(conv.id);
  });
});
