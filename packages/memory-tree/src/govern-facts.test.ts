import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memoryFactVersions, memoryFacts, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { archiveMemoryFact, correctMemoryFact } from "./govern-facts.js";
import { queryMemoryFacts } from "./query-facts.js";

describe("memory fact governance", () => {
  it("versions manual corrections and removes archived facts from recall", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "memory-governance", name: "Memory Governance" })
      .returning();
    if (!org) throw new Error("org_missing");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand_missing");
    const [fact] = await store.db
      .insert(memoryFacts)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scope: "customer",
        scopeId: "customer-1",
        predicate: "preferred_language",
        object: "English",
        confidence: 0.8,
        importance: 0.7,
      })
      .returning();
    if (!fact) throw new Error("fact_missing");

    await correctMemoryFact(store.db, {
      orgId: org.id,
      factId: fact.id,
      actorId: "admin-1",
      reason: "Customer corrected the profile",
      object: "Chinese",
      confidence: 1,
    });
    const corrected = await queryMemoryFacts(store.db, {
      orgId: org.id,
      brandId: brand.id,
      scope: "customer",
      scopeId: "customer-1",
      query: "language Chinese",
    });
    expect(corrected.facts[0]?.object).toBe("Chinese");
    expect(corrected.facts[0]?.retrievalScore).toBeGreaterThan(0);

    await archiveMemoryFact(store.db, {
      orgId: org.id,
      factId: fact.id,
      actorId: "admin-1",
      reason: "Customer requested deletion",
    });
    const afterDelete = await queryMemoryFacts(store.db, {
      orgId: org.id,
      brandId: brand.id,
      scope: "customer",
      scopeId: "customer-1",
    });
    expect(afterDelete.facts).toHaveLength(0);
    const versions = await store.db
      .select()
      .from(memoryFactVersions)
      .where(eq(memoryFactVersions.factId, fact.id));
    expect(versions.map((version) => version.decision)).toEqual(["corrected", "deleted"]);
    await store.close();
  });
});
