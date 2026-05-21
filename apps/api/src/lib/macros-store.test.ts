import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { requireRow } from "../test-helpers.js";
import { ensureBuiltinMacros, listOrgMacros } from "./macros-store.js";
import { BUILTIN_MACROS } from "./macros.js";

async function testDb() {
  const store = createLibsqlStore({ url: ":memory:" });
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../packages/storage/migrations/libsql",
  );
  await migrate(store.db, { migrationsFolder });
  const [orgRow] = await store.db
    .insert(organizations)
    .values({ slug: "t", name: "T" })
    .returning();
  const org = requireRow(orgRow, "org");
  return { store, orgId: org.id };
}

describe("macros-store", () => {
  it("seeds and lists builtin macros", async () => {
    const { store, orgId } = await testDb();
    const items = await listOrgMacros(store.db, orgId);
    expect(items.length).toBe(BUILTIN_MACROS.length);
    expect(items.some((m) => m.slug === "refund")).toBe(true);
    await store.close();
  });

  it("ensureBuiltinMacros is idempotent", async () => {
    const { store, orgId } = await testDb();
    await ensureBuiltinMacros(store.db, orgId);
    await ensureBuiltinMacros(store.db, orgId);
    const items = await listOrgMacros(store.db, orgId);
    expect(items.length).toBe(BUILTIN_MACROS.length);
    await store.close();
  });
});
