import path from "node:path";
import { fileURLToPath } from "node:url";
import { conversationMessageSourceRef, ingestConversationMessage } from "@keenai/memory-tree";
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

    const rows = await db
      .select()
      .from(memoryChunks)
      .where(eq(memoryChunks.sourceRef, conversationMessageSourceRef(msg.id)));
    expect(rows).toHaveLength(1);

    await store.close();
  });
});
