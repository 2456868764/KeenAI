import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, customActionLogs, customActions, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
import { executeAndLogCustomAction } from "./custom-action-call-log.js";
import type { CustomActionFetch } from "./custom-action-executor.js";

describe("executeAndLogCustomAction", () => {
  it("persists a success log row after execution", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "log-org", name: "Log Org" })
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
        dataAccess: { allowFields: ["status"] },
      })
      .returning();
    if (!action) throw new Error("missing action");

    const fetchMock: CustomActionFetch = vi.fn(async () =>
      Response.json({ status: "ok", secret: "hidden" }, { status: 200 }),
    );

    const result = await executeAndLogCustomAction(
      store.db,
      action,
      {
        orgId: orgRow.id,
        brandId: brandRow.id,
        source: "api",
        triggeredBy: "member-1",
      },
      { parameters: { user_id: "user-1", days: 7 } },
      { fetch: fetchMock, getSecret: () => null },
      { otelEnabled: false },
    );

    expect(result.ok).toBe(true);
    expect(result.filtered).toBe(true);

    const logs = await store.db
      .select()
      .from(customActionLogs)
      .where(eq(customActionLogs.actionId, action.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.source).toBe("api");
    expect(logs[0]?.ok).toBe(true);
    expect(logs[0]?.errorCode).toBeNull();
    expect(logs[0]?.resultData).toEqual({ status: "ok" });

    await store.close();
  });

  it("persists an error log row when execution fails", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "log-err", name: "Log Err Org" })
      .returning();
    if (!orgRow) throw new Error("missing org");

    const [action] = await store.db
      .insert(customActions)
      .values({
        orgId: orgRow.id,
        name: "disabled_action",
        endpoint: "https://api.example.com/trial",
        enabled: false,
      })
      .returning();
    if (!action) throw new Error("missing action");

    await expect(
      executeAndLogCustomAction(
        store.db,
        action,
        { orgId: orgRow.id, brandId: null, source: "copilot" },
        {},
        { fetch: vi.fn(), getSecret: () => null },
      ),
    ).rejects.toThrow("action_disabled");

    const logs = await store.db
      .select()
      .from(customActionLogs)
      .where(eq(customActionLogs.actionId, action.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.ok).toBe(false);
    expect(logs[0]?.errorCode).toBe("action_disabled");

    await store.close();
  });
});
