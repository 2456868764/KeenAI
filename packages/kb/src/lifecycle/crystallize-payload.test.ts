import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, conversations, messages, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { buildKbCrystallizePayloadFromConversation } from "./crystallize-payload.js";

describe("buildKbCrystallizePayloadFromConversation", () => {
  it("extracts first user and last agent message when closed", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "cp", name: "CP" }).returning();
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
        channelId: "kb-crystallize-payload",
        userId: "user-1",
        status: "closed",
        rating: 5,
        subject: "Help",
      })
      .returning();

    const convId = conv?.id ?? "";
    await db.insert(messages).values([
      {
        orgId: org?.id ?? "",
        conversationId: convId,
        senderType: "user",
        plainText: "How do I reset password?",
        content: { type: "text", text: "How do I reset password?" },
        isInternal: false,
      },
      {
        orgId: org?.id ?? "",
        conversationId: convId,
        senderType: "agent",
        plainText: "Use forgot password link.",
        content: { type: "text", text: "Use forgot password link." },
        isInternal: false,
      },
      {
        orgId: org?.id ?? "",
        conversationId: convId,
        senderType: "agent",
        plainText: "Let me know if that works.",
        content: { type: "text", text: "Let me know if that works." },
        isInternal: false,
      },
    ]);

    const payload = await buildKbCrystallizePayloadFromConversation(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conversationId: convId,
    });

    expect(payload?.question).toBe("How do I reset password?");
    expect(payload?.answer).toBe("Let me know if that works.");
    expect(payload?.csatScore).toBe(5);

    await store.close();
  });
});
