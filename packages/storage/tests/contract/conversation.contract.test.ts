import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, conversations, messages, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations/libsql",
);

describe("Conversation contract: libsql", () => {
  it("creates conversation and messages with consistent counts", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, { migrationsFolder });

    const [org] = await store.db
      .insert(organizations)
      .values({ slug: `contract-${Date.now()}`, name: "Contract Org" })
      .returning();
    if (!org) throw new Error("org insert failed");

    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand insert failed");

    const now = new Date();
    const [conv] = await store.db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "test",
        subject: "Contract test",
        lastMessageAt: now,
        messageCount: 1,
        unreadCount: 1,
      })
      .returning();
    if (!conv) throw new Error("conversation insert failed");

    await store.db.insert(messages).values({
      orgId: org.id,
      conversationId: conv.id,
      senderType: "user",
      plainText: "hello",
      content: { type: "text", text: "hello" },
    });

    const [loaded] = await store.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conv.id))
      .limit(1);

    expect(loaded?.messageCount).toBe(1);
    expect(loaded?.subject).toBe("Contract test");

    const msgs = await store.db.select().from(messages).where(eq(messages.conversationId, conv.id));

    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.plainText).toBe("hello");

    await store.close();
  });
});
