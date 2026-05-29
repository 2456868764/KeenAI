import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, customActionLogs, customActions, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

describe("custom_action_logs schema migration", () => {
  it("applies migration 0025 and accepts log rows", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "action-logs", name: "Action Logs Org" })
      .returning();
    if (!orgRow) throw new Error("missing org");

    const [brandRow] = await store.db
      .insert(brands)
      .values({ orgId: orgRow.id, slug: "default", name: "Default" })
      .returning();
    if (!brandRow) throw new Error("missing brand");

    const [action] = await store.db
      .insert(customActions)
      .values({
        orgId: orgRow.id,
        brandId: brandRow.id,
        name: "extend_trial",
        endpoint: "https://api.example.com/trial/extend/{{user_id}}",
        method: "POST",
      })
      .returning();
    if (!action) throw new Error("missing action");

    const [log] = await store.db
      .insert(customActionLogs)
      .values({
        orgId: orgRow.id,
        brandId: brandRow.id,
        actionId: action.id,
        actionName: action.name,
        source: "api",
        triggeredBy: "member-1",
        parameters: { user_id: "user-1", days: 7 },
        requestUrl: "https://api.example.com/trial/extend/user-1",
        requestMethod: "POST",
        responseStatus: 200,
        ok: true,
        resultData: { status: "ok" },
        filtered: true,
        durationMs: 42,
        traceId: "abc123",
        spanId: "def456",
      })
      .returning();

    expect(log?.source).toBe("api");
    expect(log?.ok).toBe(true);
    expect(log?.durationMs).toBe(42);

    await store.db.delete(customActions).where(eq(customActions.id, action.id));
    const remaining = await store.db
      .select()
      .from(customActionLogs)
      .where(eq(customActionLogs.actionId, action.id));
    expect(remaining).toHaveLength(0);

    await store.close();
  });
});
