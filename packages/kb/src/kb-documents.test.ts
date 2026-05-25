import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKeenaiKb } from "@keenai/kb";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbDocuments, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("createKeenaiKb", () => {
  it("lists active documents for a brand", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "kb", name: "KB" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const [source] = await db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "help_center",
        name: "Help Center",
      })
      .returning();
    const kbSource = requireRow(source, "source");

    await db.insert(kbDocuments).values({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      externalId: "doc-export-csv",
      title: "Export data as CSV",
      url: "https://help.example.com/export-csv",
      canonicalLocale: "en",
      contentHash: "abc123",
    });

    const kb = createKeenaiKb({ db });
    const documents = await kb.listDocuments({
      orgId: org.id,
      brandId: brand.id,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.title).toBe("Export data as CSV");
    expect(documents[0]?.sourceId).toBe(kbSource.id);

    await store.close();
  });
});
