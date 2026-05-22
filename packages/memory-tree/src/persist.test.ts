import path from "node:path";
import { fileURLToPath } from "node:url";
import { conversationMessageSourceRef, ingestConversationMessage } from "@keenai/memory-tree";
import { createLibsqlMemoryChunkFtsStore, createLibsqlStore } from "@keenai/storage";
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

describe("memory-tree persist", () => {
  it("dedupes chunks on repeated ingest", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "mem", name: "Mem" }).returning();
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
        channelId: "mem-tree",
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
        plainText: "Hello memory tree",
        content: { type: "text", text: "Hello memory tree" },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const input = {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date("2026-05-21T10:00:00.000Z"),
      plainText: "Hello memory tree",
      isInternal: false,
    };

    const first = await ingestConversationMessage(db, input);
    const second = await ingestConversationMessage(db, input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.id).toBe(second.id);
    expect(first.lifecycle).toBe("admitted");
    expect(first.fastScore).toBeGreaterThanOrEqual(0.5);

    const rows = await db
      .select()
      .from(memoryChunks)
      .where(eq(memoryChunks.sourceRef, conversationMessageSourceRef(msg.id)));
    expect(rows).toHaveLength(1);

    await store.close();
  });

  it("indexes new chunks in fts_memory_chunks when ftsIndexer is provided", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const fts = createLibsqlMemoryChunkFtsStore(store.client);

    const orgRow = await db.insert(organizations).values({ slug: "fts", name: "Fts" }).returning();
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
        channelId: "fts-tree",
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
        plainText: "Need help with billing invoice",
        content: { type: "text", text: "Need help with billing invoice" },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const result = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date("2026-05-21T10:00:00.000Z"),
      plainText: "Need help with billing invoice",
      isInternal: false,
      ftsIndexer: fts,
    });

    expect(result.created).toBe(true);

    const hits = await fts.search({
      orgId: org.id,
      brandId: brand.id,
      q: "billing",
      limit: 10,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(result.id);

    await store.close();
  });
});
