import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  ingestConversationMessage,
  processAdmittedChunk,
  queryCustomerMemoryTree,
  refreshCustomerHotness,
  topicRouteChunk,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  conversations,
  memoryHotness,
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

describe("memory-tree topic route", () => {
  it("routes admitted chunks into customer topic tree when hot", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "top", name: "Top" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");
    const userId = "user_hot_customer";
    const convRow = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId,
        channelType: "messenger",
        channelId: "topic-tree",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const texts = ["Billing issue on invoice INV-1.", "Still waiting on refund update."];
    let lastChunkId = "";

    for (const text of texts) {
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
      lastChunkId = ingest.id;
    }

    const hotness = await refreshCustomerHotness(db, {
      orgId: org.id,
      brandId: brand.id,
      userId,
    });
    expect(hotness.hot).toBe(true);
    expect(hotness.score).toBeGreaterThanOrEqual(2);

    const coldRoute = await topicRouteChunk(db, {
      orgId: org.id,
      brandId: brand.id,
      chunkId: lastChunkId,
      userId: "user_cold",
      hotnessThreshold: 99,
    });
    expect(coldRoute.routed).toBe(false);

    const result = await processAdmittedChunk(db, {
      orgId: org.id,
      brandId: brand.id,
      chunkId: lastChunkId,
    });
    expect(result.topicRouted).toBe(true);

    const [topicBuffer] = await db
      .select()
      .from(memoryTreeBuffers)
      .where(
        and(
          eq(memoryTreeBuffers.orgId, org.id),
          eq(memoryTreeBuffers.scopeKey, `customer:${userId}`),
        ),
      );
    expect(topicBuffer?.leafIds.length).toBeGreaterThan(0);

    const tree = await queryCustomerMemoryTree(db, {
      orgId: org.id,
      brandId: brand.id,
      userId,
      mode: "latest",
    });
    expect(tree.scope).toBe("customer");
    expect(tree.levels[0]?.nodes.length).toBeGreaterThan(0);

    const [hotRow] = await db
      .select()
      .from(memoryHotness)
      .where(and(eq(memoryHotness.orgId, org.id), eq(memoryHotness.entityId, userId)));
    expect(hotRow?.score).toBeGreaterThanOrEqual(2);

    await store.close();
  });
});
