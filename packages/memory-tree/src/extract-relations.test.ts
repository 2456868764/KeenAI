import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractEntitiesFromSummary, extractRelationsFromSummary } from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryRelations, memorySummaries, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("extractRelationsFromSummary", () => {
  it("persists stub relations after entities exist", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "rel", name: "Rel" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const convId = "conv_relations";
    const [summaryRow] = await db
      .insert(memorySummaries)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scopeKey: `conv:${convId}`,
        level: 1,
        title: "Billing support",
        summary: "Customer asked about Pro plan upgrade and order ORD-88888 billing.",
        provenance: { chunkIds: [], messageIds: [] },
      })
      .returning();
    const summary = requireRow(summaryRow, "summary");

    await extractEntitiesFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
    });

    const result = await extractRelationsFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
    });

    expect(result.extracted).toBe(true);
    expect(result.relationCount).toBeGreaterThan(0);

    const rows = await db.select().from(memoryRelations).where(eq(memoryRelations.orgId, org.id));
    expect(rows.some((row) => row.relationType === "concerns")).toBe(true);

    await store.close();
  });
});
