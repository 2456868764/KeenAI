import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractFactsFromSummary,
  runMemoryConsolidation,
  runMemoryDecaySweep,
} from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  memoryFacts,
  memorySlots,
  memorySummaries,
  organizations,
} from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("memory consolidation and decay", () => {
  it("re-projects slots during consolidation", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "con", name: "Con" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const convId = "conv_consolidate";
    const [summaryRow] = await db
      .insert(memorySummaries)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scopeKey: `conv:${convId}`,
        level: 1,
        title: "Billing",
        summary: "Customer asked about Pro plan upgrade and order ORD-44444 billing.",
        provenance: { chunkIds: [], messageIds: [] },
      })
      .returning();
    const summary = requireRow(summaryRow, "summary");

    await extractFactsFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
    });

    const result = await runMemoryConsolidation(db, { orgId: org.id, brandId: brand.id });
    expect(result.scopesProcessed).toBe(1);
    expect(result.totalSlots).toBeGreaterThan(0);

    const slots = await db
      .select()
      .from(memorySlots)
      .where(and(eq(memorySlots.orgId, org.id), eq(memorySlots.scopeId, convId)));
    expect(slots.length).toBeGreaterThan(0);

    await store.close();
  });

  it("archives decayed facts and evicts overflow by eviction score", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "dec", name: "Dec" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const scope = "conversation";
    const scopeId = "conv_decay";
    const now = new Date("2026-06-01T00:00:00.000Z");
    const stale = new Date("2026-01-01T00:00:00.000Z");

    await db.insert(memoryFacts).values({
      orgId: org.id,
      brandId: brand.id,
      scope,
      scopeId,
      predicate: "weak_fact",
      object: "old",
      confidence: 0.08,
      importance: 0.1,
      updatedAt: stale,
      lastAccessAt: stale,
      accessCount: 0,
    });

    for (let i = 0; i < 3; i++) {
      await db.insert(memoryFacts).values({
        orgId: org.id,
        brandId: brand.id,
        scope,
        scopeId,
        predicate: `strong_fact_${i}`,
        object: `value-${i}`,
        confidence: 0.95,
        importance: 0.9,
        updatedAt: new Date("2026-05-30T00:00:00.000Z"),
        lastAccessAt: new Date("2026-05-30T00:00:00.000Z"),
        accessCount: 5,
      });
    }

    const sweep = await runMemoryDecaySweep(db, {
      orgId: org.id,
      brandId: brand.id,
      now,
      maxFactsPerScope: 2,
    });

    expect(sweep.factsScanned).toBe(4);
    expect(sweep.factsArchived).toBeGreaterThan(0);

    const active = await db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.orgId, org.id), isNull(memoryFacts.archivedAt)));
    expect(active.length).toBeLessThanOrEqual(2);

    await store.close();
  });
});
