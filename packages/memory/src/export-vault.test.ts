import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportMemoryVault } from "@keenai/memory";
import { createKeenaiMemory } from "@keenai/memory";
import { createLibsqlStore } from "@keenai/storage";
import { brands, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("exportMemoryVault", () => {
  it("writes markdown vault files for active memory", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "vault", name: "Vault" })
      .returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const memory = createKeenaiMemory({ db });
    await memory.store({
      orgId: org.id,
      brandId: brand.id,
      scope: "customer",
      scopeId: "user_vault",
      predicate: "preferred_language",
      object: "en",
    });

    const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.tmp/test-vault");
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const result = await exportMemoryVault(db, {
      orgId: org.id,
      brandId: brand.id,
      outDir,
    });
    expect(result.filesWritten).toBeGreaterThan(0);

    const readme = await readFile(path.join(outDir, "README.md"), "utf8");
    expect(readme).toContain("KeenAI Memory Vault");
    const facts = await readFile(path.join(outDir, "facts/customer_user_vault.md"), "utf8");
    expect(facts).toContain("preferred_language");

    await rm(outDir, { recursive: true, force: true });
    await store.close();
  });
});
