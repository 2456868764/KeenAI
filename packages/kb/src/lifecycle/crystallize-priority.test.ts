import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryHotness, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { rankKbCrystallizeCandidates } from "./crystallize-priority.js";

describe("KB-24 crystallize priority", () => {
  it("ranks conversations by customer hotness", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "hot", name: "Hot" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();

    const hotSignals = {
      messageCount7d: 0,
      openTicketCount: 0,
      negativeCsatWeight: 0,
      agentPinBoost: 0,
    };
    await db.insert(memoryHotness).values({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      entityType: "customer",
      entityId: "user-hot",
      score: 5,
      signals: hotSignals,
    });
    await db.insert(memoryHotness).values({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      entityType: "customer",
      entityId: "user-cold",
      score: 0.5,
      signals: hotSignals,
    });

    const ranked = await rankKbCrystallizeCandidates(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conversationIds: [
        { conversationId: "c-cold", userId: "user-cold" },
        { conversationId: "c-hot", userId: "user-hot" },
      ],
    });

    expect(ranked[0]?.conversationId).toBe("c-hot");
    expect(ranked[0]?.priority).toBeGreaterThan(ranked[1]?.priority ?? 0);

    await store.close();
  });
});
