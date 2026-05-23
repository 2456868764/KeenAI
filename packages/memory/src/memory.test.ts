import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKeenaiMemory } from "@keenai/memory";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryFacts, memorySlots, organizations } from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("createKeenaiMemory", () => {
  it("stores, gets, recalls, and forgets scoped facts", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "mem", name: "Mem" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const memory = createKeenaiMemory({ db });
    const scope = "customer";
    const scopeId = "user_123";

    const stored = await memory.store({
      orgId: org.id,
      brandId: brand.id,
      scope,
      scopeId,
      predicate: "preferred_language",
      object: "en",
      confidence: 0.9,
    });
    expect(stored.factId).toBeTruthy();
    expect(stored.slotCount).toBe(1);

    const got = await memory.get({
      orgId: org.id,
      brandId: brand.id,
      scope,
      scopeId,
      predicate: "preferred_language",
    });
    expect(got.facts).toHaveLength(1);
    expect(got.facts[0]?.object).toBe("en");
    expect(got.slots[0]?.key).toBe("preferred_language");

    const forgotten = await memory.forget({
      orgId: org.id,
      brandId: brand.id,
      scope,
      scopeId,
      predicate: "preferred_language",
      reason: "user_request",
    });
    expect(forgotten.forgotten).toBe(1);

    const active = await db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.orgId, org.id), isNull(memoryFacts.archivedAt)));
    expect(active).toHaveLength(0);

    const slots = await db
      .select()
      .from(memorySlots)
      .where(and(eq(memorySlots.orgId, org.id), eq(memorySlots.scopeId, scopeId)));
    expect(slots).toHaveLength(0);

    const recall = await memory.recall({
      orgId: org.id,
      brandId: brand.id,
      q: "language",
    });
    expect(recall.hits).toEqual([]);

    await store.close();
  });
});
