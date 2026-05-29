import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DraftToolRuntime } from "@keenai/llm";
import { createLibsqlStore } from "@keenai/storage";
import { brands, customActions, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
import type { CustomActionFetch } from "./custom-action-executor.js";
import { loadCustomActionDraftTools } from "./custom-action-tools.js";

describe("loadCustomActionDraftTools", () => {
  it("maps enabled http_direct actions into copilot draft tools", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "tools", name: "Tools" })
      .returning();
    if (!orgRow) throw new Error("missing org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: orgRow.id, slug: "default", name: "Default" })
      .returning();
    if (!brandRow) throw new Error("missing brand");

    await db.insert(customActions).values({
      orgId: orgRow.id,
      brandId: brandRow.id,
      name: "extend_trial",
      description: "Extend trial",
      endpoint: "https://api.example.com/trial/extend/{{user_id}}",
      method: "POST",
      authType: "none",
      enabled: true,
    });

    const fetchMock: CustomActionFetch = vi.fn(async () =>
      Response.json({ status: "ok", new_end_date: "2026-06-01" }),
    );

    const tools = await loadCustomActionDraftTools(
      db,
      { orgId: orgRow.id, brandId: brandRow.id },
      { fetch: fetchMock, getSecret: () => null },
    );

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("extend_trial");

    const result = await (tools[0] as DraftToolRuntime).execute({ user_id: "user-1" });
    expect(result).toEqual({ status: "ok", new_end_date: "2026-06-01" });
    expect(fetchMock).toHaveBeenCalled();

    await store.close();
  });
});
