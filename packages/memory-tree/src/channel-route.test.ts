import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  channelScopeKey,
  ingestConversationMessage,
  processAdmittedChunk,
  queryChannelMemoryTree,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  conversations,
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

describe("memory-tree channel route", () => {
  it("routes slack messages into a shared channel source tree", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "ch", name: "Ch" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");
    const channelId = "C_SUPPORT";
    const convRow = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "slack",
        channelId,
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
        plainText: "Need help in #support channel.",
        content: { type: "text", text: "Need help in #support channel." },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date("2026-05-29T10:00:00.000Z"),
      plainText: "Need help in #support channel.",
      isInternal: false,
      channelType: "slack",
      channelId,
    });
    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText: "Need help in #support channel.",
      source: "conversation_message",
      senderType: "user",
    });

    const result = await processAdmittedChunk(db, {
      orgId: org.id,
      brandId: brand.id,
      chunkId: ingest.id,
    });
    expect(result.channelRouted).toBe(true);
    expect(result.channelScopeKey).toBe(channelScopeKey("slack", channelId));

    const tree = await queryChannelMemoryTree(db, {
      orgId: org.id,
      brandId: brand.id,
      channelType: "slack",
      channelId,
      mode: "latest",
    });
    expect(tree.scope).toBe("channel");
    expect(tree.levels[0]?.nodes.length).toBeGreaterThan(0);

    const [buffer] = await db
      .select()
      .from(memoryTreeBuffers)
      .where(
        and(
          eq(memoryTreeBuffers.orgId, org.id),
          eq(memoryTreeBuffers.scopeKey, channelScopeKey("slack", channelId)),
        ),
      );
    expect(buffer?.leafIds).toContain(ingest.id);

    await store.close();
  });

  it("skips channel routing for messenger conversations", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "m", name: "M" }).returning();
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
        channelId: "widget-1",
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
        plainText: "Widget question.",
        content: { type: "text", text: "Widget question." },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date(),
      plainText: "Widget question.",
      isInternal: false,
      channelType: "messenger",
      channelId: "widget-1",
    });
    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText: "Widget question.",
      source: "conversation_message",
      senderType: "user",
    });

    const result = await processAdmittedChunk(db, {
      orgId: org.id,
      brandId: brand.id,
      chunkId: ingest.id,
    });
    expect(result.channelRouted).toBeFalsy();

    await store.close();
  });
});
