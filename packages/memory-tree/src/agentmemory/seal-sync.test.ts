import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BUFFER_CONFIG,
  ingestConversationMessage,
  initAgentMemoryRuntime,
  processAdmittedChunk,
  resolveAgentMemoryConfig,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  conversations,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("agentmemory seal sync integration", () => {
  it("syncs sealed summary when runtime sync is enabled", async () => {
    const rememberCalls: unknown[] = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const target = String(url);
      if (target.includes("livez")) return new Response(null, { status: 200 });
      if (target.includes("remember")) {
        rememberCalls.push(JSON.parse(String(init?.body ?? "{}")));
        return Response.json({ id: "mem_sync_1" });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    initAgentMemoryRuntime({
      ...resolveAgentMemoryConfig({ MEMORY_TREE_AGENTMEMORY_SYNC: true }),
      url: "http://127.0.0.1:3111",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;

    try {
      const orgRow = await db.insert(organizations).values({ slug: "am", name: "AM" }).returning();
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
          channelId: "am-sync",
          status: "open",
        })
        .returning();
      const conv = requireRow(convRow[0], "conversation");

      const texts = ["msg one", "msg two", "msg three"];
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
          sentAt: new Date(),
          plainText: text,
          isInternal: false,
        });
        await processAdmittedChunk(db, {
          orgId: org.id,
          brandId: brand.id,
          chunkId: ingest.id,
          config: { ...DEFAULT_BUFFER_CONFIG, maxLeaves: 1, maxTokens: 50 },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(rememberCalls.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
      initAgentMemoryRuntime(null);
      await store.close();
    }
  });
});
