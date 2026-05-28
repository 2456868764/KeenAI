import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, customActions, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

describe("custom_actions schema migration", () => {
  it("applies migration 0024 and accepts action rows", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "actions", name: "Actions Org" })
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
        description: "Extend a customer trial period",
        whenToUse: "When the user asks for more trial days",
        parametersSchema: {
          type: "object",
          properties: {
            user_id: { type: "string" },
            days: { type: "integer" },
          },
          required: ["user_id", "days"],
        },
        endpoint: "https://api.example.com/trial/extend/{{user_id}}",
        method: "POST",
        authType: "hmac",
        authSecretRef: "vault:extend-trial-hmac",
        dataAccess: { allowFields: ["status", "new_end_date"] },
        sandbox: "http_direct",
      })
      .returning();

    expect(action?.name).toBe("extend_trial");
    expect(action?.authType).toBe("hmac");
    expect(action?.enabled).toBe(true);

    await store.close();
  });
});
