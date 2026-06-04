import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHelpCenterStubConnector,
  createKeenaiKb,
  createStubKbQueryEmbedder,
  createStubKbReranker,
} from "@keenai/kb";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("searchKbChunks", () => {
  it("returns hybrid fused hits for indexed help center content", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const chunkVector = createLibsqlKbChunkVectorStore(store.client);

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "search", name: "Search" })
      .returning();
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

    const result = await kb.search({
      orgId: org.id,
      brandId: brand.id,
      q: "billing invoice",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      limit: 5,
    });

    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.some((hit) => hit.documentTitle === "Billing FAQ")).toBe(true);
    expect(result.hits[0]?.fusedScore).toBeGreaterThan(0);
    expect(result.hits[0]?.sources.length).toBeGreaterThan(0);

    const withRerank = await kb.search({
      orgId: org.id,
      brandId: brand.id,
      q: "billing invoice",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      reranker: createStubKbReranker(),
      limit: 3,
    });
    expect(withRerank.hits[0]?.rerankScore).toBeDefined();

    await store.close();
  });
});
