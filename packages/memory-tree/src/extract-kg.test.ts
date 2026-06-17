import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryRelations, memorySummaries, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { extractKgFromSummary } from "./extract-kg.js";
import { stubExtractEntities } from "./stub-entity-extractor.js";
import { stubExtractRelations } from "./stub-relation-extractor.js";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("extractKgFromSummary", () => {
  it("persists stub entities and relations in one pass", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "kg", name: "KG" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const [summaryRow] = await db
      .insert(memorySummaries)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scopeKey: "conv:conv_kg",
        level: 1,
        title: "Billing support",
        summary: "Customer asked about Pro plan upgrade and order ORD-88888 billing.",
        provenance: { chunkIds: [], messageIds: [] },
      })
      .returning();
    const summary = requireRow(summaryRow, "summary");

    const result = await extractKgFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
      kgExtractor: {
        model: "stub/rules",
        extract: async (input) => ({
          entities: stubExtractEntities(input),
          relations: stubExtractRelations(input),
        }),
      },
    });

    expect(result.entityResult.extracted).toBe(true);
    expect(result.relationResult.extracted).toBe(true);

    const relations = await db
      .select()
      .from(memoryRelations)
      .where(eq(memoryRelations.orgId, org.id));
    expect(relations.some((row) => row.relationType === "concerns")).toBe(true);

    await store.close();
  });
});
