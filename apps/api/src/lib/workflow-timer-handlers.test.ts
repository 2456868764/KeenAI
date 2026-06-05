import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, conversations, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createWorkflowTimerHandlers } from "./workflow-timer-handlers.js";

describe("workflow timer handlers (P1-05)", () => {
  it("auto-closes open conversations", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    if (!org) throw new Error("fixture failed");
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default", locale: "en" })
      .returning();
    if (!brand) throw new Error("fixture failed");

    const [conv] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId: "user@test.local",
        channelType: "web",
        channelId: "web-1",
        status: "open",
      })
      .returning();
    if (!conv) throw new Error("fixture failed");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const handlers = createWorkflowTimerHandlers(db, env);
    const result = await handlers.runAutoCloseTimer({
      workflowRunId: "run-1",
      conversationId: conv.id,
      orgId: org.id,
      brandId: brand.id,
      autoCloseMs: 60_000,
    });

    expect(result.closed).toBe(true);

    const [updated] = await db
      .select({ status: conversations.status })
      .from(conversations)
      .where(eq(conversations.id, conv.id))
      .limit(1);
    expect(updated?.status).toBe("closed");

    await store.close();
  });
});
