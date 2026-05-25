import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryEntities, memoryRelations, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("memory_relations schema", () => {
  it("migrates and stores entity relations", async () => {
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

    const [fromEntity] = await db
      .insert(memoryEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scope: "customer",
        scopeId: "user_kg",
        entityType: "person",
        name: "Alex",
      })
      .returning();
    const from = requireRow(fromEntity, "from");

    const [toEntity] = await db
      .insert(memoryEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scope: "customer",
        scopeId: "user_kg",
        entityType: "product",
        name: "Pro Plan",
      })
      .returning();
    const to = requireRow(toEntity, "to");

    await db.insert(memoryRelations).values({
      orgId: org.id,
      brandId: brand.id,
      fromEntityId: from.id,
      relationType: "concerns",
      toEntityId: to.id,
      confidence: 0.9,
      evidence: ["summary-1"],
    });

    const rows = await db.select().from(memoryRelations).where(eq(memoryRelations.orgId, org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.relationType).toBe("concerns");
    expect(rows[0]?.fromEntityId).toBe(from.id);
    expect(rows[0]?.toEntityId).toBe(to.id);

    await store.close();
  });
});
