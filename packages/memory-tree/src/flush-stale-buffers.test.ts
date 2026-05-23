import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationScopeKey,
  extractEntitiesFromSummary,
  flushStaleBuffers,
  ingestConversationMessage,
  processAdmittedChunk,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  conversations,
  memoryChunks,
  memoryEntities,
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

describe("flushStaleBuffers", () => {
  it("seals non-empty buffers older than the stale window", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "flush", name: "Flush" })
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
        channelId: "flush-tree",
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
        plainText: "Need help with billing for ORD-77777.",
        content: { type: "text", text: "Need help with billing for ORD-77777." },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date("2026-05-21T10:00:00.000Z"),
      plainText: "Need help with billing for ORD-77777.",
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
    });

    const staleAt = new Date("2026-05-21T12:00:00.000Z");
    await db
      .update(memoryTreeBuffers)
      .set({ updatedAt: new Date("2026-05-21T10:05:00.000Z") })
      .where(
        and(
          eq(memoryTreeBuffers.orgId, org.id),
          eq(memoryTreeBuffers.scopeKey, conversationScopeKey(conv.id)),
        ),
      );

    const flushResult = await flushStaleBuffers(db, {
      staleAfterMs: 30 * 60 * 1000,
      now: staleAt,
    });

    expect(flushResult.flushed).toBe(1);
    expect(flushResult.summaryIds).toHaveLength(1);

    const summaries = await db
      .select()
      .from(memorySummaries)
      .where(eq(memorySummaries.orgId, org.id));
    expect(summaries).toHaveLength(1);

    const summary = requireRow(flushResult.summaryIds[0], "summaryId");
    const entities = await extractEntitiesFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary,
    });
    expect(entities.extracted).toBe(true);

    const rows = await db.select().from(memoryEntities).where(eq(memoryEntities.orgId, org.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.name === "ORD-77777")).toBe(true);

    await store.close();
  });
});
