import path from "node:path";
import { fileURLToPath } from "node:url";
import { queryRelatedTopics } from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryEntities, memoryRelations, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("queryRelatedTopics", () => {
  it("walks outgoing relations up to maxDepth", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "graph", name: "Graph" })
      .returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const scope = "customer";
    const scopeId = "user_graph";

    const [topicA] = await db
      .insert(memoryEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scope,
        scopeId,
        entityType: "topic",
        name: "Billing",
      })
      .returning();
    const a = requireRow(topicA, "a");

    const [productB] = await db
      .insert(memoryEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scope,
        scopeId,
        entityType: "product",
        name: "Pro Plan",
      })
      .returning();
    const b = requireRow(productB, "b");

    const [productC] = await db
      .insert(memoryEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scope,
        scopeId,
        entityType: "product",
        name: "ORD-99999",
      })
      .returning();
    const c = requireRow(productC, "c");

    await db.insert(memoryRelations).values([
      {
        orgId: org.id,
        brandId: brand.id,
        fromEntityId: a.id,
        relationType: "concerns",
        toEntityId: b.id,
        confidence: 0.9,
      },
      {
        orgId: org.id,
        brandId: brand.id,
        fromEntityId: b.id,
        relationType: "concerns",
        toEntityId: c.id,
        confidence: 0.8,
      },
    ]);

    const depth1 = await queryRelatedTopics(db, {
      orgId: org.id,
      entityId: a.id,
      maxDepth: 1,
    });
    expect(depth1).toHaveLength(1);
    expect(depth1[0]?.entityId).toBe(b.id);

    const depth2 = await queryRelatedTopics(db, {
      orgId: org.id,
      entityId: a.id,
      maxDepth: 2,
    });
    expect(depth2).toHaveLength(2);
    expect(depth2.map((row) => row.entityId).sort()).toEqual([b.id, c.id].sort());

    await store.close();
  });
});
