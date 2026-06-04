import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFastScoreToChunk,
  digestDailyForBrand,
  ingestConversationMessage,
  isMemoryTreeRetrievalScope,
  memoryScopeToRetrievalScope,
  processAdmittedChunk,
  queryMemoryTreeByScope,
  resolveMemoryScope,
  retrievalScopeKey,
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

describe("retrieval-scope MT-05 stub", () => {
  it("validates scopes and maps agent scope router", () => {
    expect(isMemoryTreeRetrievalScope("conversation")).toBe(true);
    expect(isMemoryTreeRetrievalScope("channel")).toBe(false);
    expect(
      memoryScopeToRetrievalScope(resolveMemoryScope({ instruction: "这个客户之前" }).scope),
    ).toBe("customer");
    expect(
      memoryScopeToRetrievalScope(resolveMemoryScope({ instruction: "产品怎么用" }).scope),
    ).toBeNull();
  });

  it("queries conversation and brand_daily via unified router", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "mt05", name: "MT05" })
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
        channelId: "mt05",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const dateUtc = "2026-05-25";
    const plainText = "Billing question about invoice INV-1001.";
    const msgRow = await db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conv.id,
        senderType: "user",
        plainText,
        content: { type: "text", text: plainText },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date(`${dateUtc}T10:00:00.000Z`),
      plainText,
      isInternal: false,
    });

    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText,
      source: "conversation_message",
      senderType: "user",
    });

    await processAdmittedChunk(db, {
      orgId: org.id,
      brandId: brand.id,
      chunkId: ingest.id,
      config: { maxLeaves: 8, maxTokens: 10_000 },
    });

    const convKey = retrievalScopeKey({
      scope: "conversation",
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      mode: "latest",
    });
    const tree = await queryMemoryTreeByScope(db, {
      scope: "conversation",
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      mode: "latest",
    });
    expect(tree?.scope).toBe("conversation");
    expect(tree && "scopeKey" in tree && tree.scopeKey).toBe(convKey);

    await db
      .update(memoryChunks)
      .set({ createdAt: new Date(`${dateUtc}T10:00:00.000Z`) })
      .where(eq(memoryChunks.id, ingest.id));

    await digestDailyForBrand(db, { orgId: org.id, brandId: brand.id, dateUtc });

    const digest = await queryMemoryTreeByScope(db, {
      scope: "brand_daily",
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(digest?.scope).toBe("brand_daily");
    expect(digest && "summary" in digest && digest.summary).toContain("Billing question");

    const missing = await queryMemoryTreeByScope(db, {
      scope: "brand_daily",
      orgId: org.id,
      brandId: brand.id,
      dateUtc: "2020-01-01",
    });
    expect(missing).toBeNull();

    await store.close();
  });
});
