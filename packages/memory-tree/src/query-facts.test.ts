import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFactsFromSummary, queryMemoryFacts } from "@keenai/memory-tree";
import { createLibsqlStore } from "@keenai/storage";
import { brands, memorySummaries, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("queryMemoryFacts", () => {
  it("returns facts and slots for a conversation scope", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "qf", name: "QF" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const convId = "conv_query_facts";
    const [summaryRow] = await db
      .insert(memorySummaries)
      .values({
        orgId: org.id,
        brandId: brand.id,
        scopeKey: `conv:${convId}`,
        level: 1,
        title: "Billing",
        summary: "Customer shared support@acme.com about invoice ORD-99999.",
        provenance: { chunkIds: [], messageIds: [] },
      })
      .returning();
    const summary = requireRow(summaryRow, "summary");

    await extractFactsFromSummary(db, {
      orgId: org.id,
      brandId: brand.id,
      summaryId: summary.id,
    });

    const result = await queryMemoryFacts(db, {
      orgId: org.id,
      brandId: brand.id,
      scope: "conversation",
      scopeId: convId,
    });

    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.facts.some((row) => row.predicate === "contact_email")).toBe(true);

    await store.close();
  });
});
