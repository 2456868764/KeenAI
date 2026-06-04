import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHelpCenterStubConnector,
  createKeenaiKb,
  createStubKbQueryEmbedder,
  searchKbChunks,
} from "@keenai/kb";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbChunks, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import {
  buildKbSectionSummary,
  hydrateKbChunkContext,
  hydrateKbSearchHits,
  mergeKbHydratedContextPrefix,
} from "./hydrate.js";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("hydrate KB-10", () => {
  it("builds section summary and merged context prefix", () => {
    const summary = buildKbSectionSummary([
      { content: "First paragraph about billing.", chunkIndex: 0 },
      { content: "Second paragraph about invoices.", chunkIndex: 1 },
    ]);
    expect(summary).toContain("billing");
    expect(summary).toContain("invoices");

    const merged = mergeKbHydratedContextPrefix("Billing FAQ > Invoices", summary);
    expect(merged).toContain("Billing FAQ > Invoices");
    expect(merged).toContain("Section summary:");

    const hydrated = hydrateKbChunkContext(
      {
        chunkId: "c1",
        documentId: "d1",
        sectionId: "s1",
        parentChunkId: null,
        contextPrefix: "Billing FAQ > Invoices",
        content: "Invoice details",
        chunkIndex: 1,
      },
      summary,
    );
    expect(hydrated.sectionSummary).toBe(summary);
    expect(hydrated.hydratedContextPrefix).toContain("Section summary:");
  });

  it("hydrates search hits with sibling section context", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });
    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const chunkVector = createLibsqlKbChunkVectorStore(store.client);

    const orgRow = await db.insert(organizations).values({ slug: "hyd", name: "Hyd" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    const kbSource = requireRow(source, "source");

    const kb = createKeenaiKb({ db });
    await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createHelpCenterStubConnector(),
    });

    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    for (const document of documents) {
      await kb.indexDocument({
        orgId: org.id,
        brandId: brand.id,
        documentId: document.id,
        chunkFtsIndexer: chunkFts,
      });
    }

    const result = await searchKbChunks(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "billing invoice",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      limit: 5,
      rerank: false,
      hydrate: true,
    });

    expect(result.hits.length).toBeGreaterThan(0);
    const hit = result.hits[0];
    expect(hit?.sectionSummary).toBeTruthy();
    expect(hit?.hydratedContextPrefix ?? hit?.contextPrefix).toContain("Section summary:");
    expect(hit?.contextPrefix).toContain("Section summary:");

    const billingDoc = documents.find((doc) => doc.title === "Billing FAQ");
    if (billingDoc) {
      const sectionChunks = await db
        .select()
        .from(kbChunks)
        .where(eq(kbChunks.documentId, billingDoc.id));
      const leaf = sectionChunks[1];
      if (leaf) {
        const parentRow = await db
          .insert(kbChunks)
          .values({
            orgId: org.id,
            brandId: brand.id,
            documentId: billingDoc.id,
            sectionId: leaf.sectionId,
            chunkIndex: 0,
            content: "Parent section overview for billing and invoices.",
            contextPrefix: leaf.contextPrefix,
          })
          .returning();
        const parent = requireRow(parentRow[0], "parent");

        await db.update(kbChunks).set({ parentChunkId: parent.id }).where(eq(kbChunks.id, leaf.id));

        const hydrated = await hydrateKbSearchHits(
          db,
          [
            {
              chunkId: leaf.id,
              documentId: leaf.documentId,
              sectionId: leaf.sectionId,
              parentChunkId: parent.id,
              contextPrefix: leaf.contextPrefix,
              content: leaf.content,
              chunkIndex: leaf.chunkIndex,
            },
          ],
          { orgId: org.id, brandId: brand.id },
        );
        expect(hydrated[0]?.sectionSummary).toContain("Parent section");
      }
    }

    await store.close();
  });
});
