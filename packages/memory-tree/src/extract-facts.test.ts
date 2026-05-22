import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFactsFromSummary } from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  memoryFacts,
  memorySlots,
  memorySummaries,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("extractFactsFromSummary", () => {
  it("persists facts and slots from a sealed conversation summary", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "facts", name: "Facts" })
      .returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const convId = "conv_facts_test";
    const [summaryRow] = await db
      .insert(memorySummaries)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scopeKey: `conv:${convId}`,
        level: 1,
        title: "Billing follow-up",
        summary:
          "Customer asked about invoice billing and shared support@acme.com for order ORD-12345.",
        provenance: { chunkIds: [], messageIds: [], keyEvents: ["invoice billing"] },
      })
      .returning();
    const summary = requireRow(summaryRow, "summary");

    const result = await extractFactsFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
    });

    expect(result.extracted).toBe(true);
    expect(result.factCount).toBeGreaterThan(0);
    expect(result.slotCount).toBeGreaterThan(0);

    const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.orgId, org.id));
    expect(facts.some((row) => row.predicate === "contact_email")).toBe(true);
    expect(facts.some((row) => row.predicate === "order_id")).toBe(true);

    const slots = await db.select().from(memorySlots).where(eq(memorySlots.orgId, org.id));
    expect(slots.some((row) => row.key === "contact_email")).toBe(true);

    await store.close();
  });
});
