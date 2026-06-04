import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, conversations, messages, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { buildKbCrystallizePayloadFromConversation } from "./crystallize-payload.js";

describe("buildKbCrystallizePayloadFromConversation without rating", () => {
  it("returns null when conversation has no rating and no default override", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "nr", name: "NR" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [conv] = await db
      .insert(conversations)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id ?? "",
        channelType: "messenger",
        channelId: "nr-1",
        userId: "u1",
        status: "closed",
        rating: null,
      })
      .returning();

    const convId = conv?.id ?? "";
    await db.insert(messages).values([
      {
        orgId: org?.id ?? "",
        conversationId: convId,
        senderType: "user",
        plainText: "Q?",
        content: { type: "text", text: "Q?" },
        isInternal: false,
      },
      {
        orgId: org?.id ?? "",
        conversationId: convId,
        senderType: "agent",
        plainText: "A.",
        content: { type: "text", text: "A." },
        isInternal: false,
      },
    ]);

    const payload = await buildKbCrystallizePayloadFromConversation(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conversationId: convId,
    });

    expect(payload).toBeNull();
    await store.close();
  });
});
