import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  ingestConversationMessage,
  processAdmittedChunk,
  queryMemoryExplorerStats,
  refreshCustomerHotness,
  searchMemoryChunks,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import { brands, conversations, messages, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("memory-tree explorer", () => {
  it("returns stats and search hits for a brand", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "exp", name: "Exp" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");
    const userId = "user_explorer";
    const convRow = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId,
        channelType: "messenger",
        channelId: "exp",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    for (const text of ["Enterprise billing question.", "Refund follow-up on invoice."]) {
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
        sentAt: new Date("2026-05-28T10:00:00.000Z"),
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

    await refreshCustomerHotness(db, { orgId: org.id, brandId: brand.id, userId });

    const stats = await queryMemoryExplorerStats(db, { orgId: org.id, brandId: brand.id });
    expect(stats.chunkCount).toBeGreaterThanOrEqual(2);
    expect(stats.sourceCount).toBeGreaterThanOrEqual(1);
    expect(stats.storageBytes).toBeGreaterThan(0);

    const search = await searchMemoryChunks(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "billing",
      scope: "conversation",
    });
    expect(search.hits.length).toBeGreaterThan(0);
    expect(search.hits[0]?.conversationId).toBe(conv.id);

    await store.close();
  });
});
