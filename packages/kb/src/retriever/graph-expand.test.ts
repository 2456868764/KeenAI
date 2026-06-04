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
import {
  brands,
  kbChunks,
  kbEntities,
  kbRelations,
  kbSources,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import {
  KB_RRF_WEIGHTS_DEFAULT,
  expandKbChunksFromGraph,
  fuseKbChunkRankings,
  scoreKbEntityQueryMatch,
} from "./graph-expand.js";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("graph-expand KB-09", () => {
  it("scores entity query overlap", () => {
    expect(
      scoreKbEntityQueryMatch("billing invoice", { name: "Billing", aliases: [] }),
    ).toBeGreaterThan(0);
    expect(scoreKbEntityQueryMatch("billing", { name: "Slack", aliases: [] })).toBe(0);
  });

  it("fuses three lists with default RRF weights", () => {
    const fused = fuseKbChunkRankings(
      [
        { hits: [{ id: "a" }, { id: "b" }], source: "fts", weight: KB_RRF_WEIGHTS_DEFAULT.fts },
        {
          hits: [{ id: "b" }, { id: "c" }],
          source: "vector",
          weight: KB_RRF_WEIGHTS_DEFAULT.vector,
        },
        { hits: [{ id: "d" }], source: "graph", weight: KB_RRF_WEIGHTS_DEFAULT.graph },
      ],
      { topK: 4 },
    );
    expect(fused[0]?.id).toBe("b");
    expect(fused[0]?.sources.sort()).toEqual(["fts", "vector"]);
    expect(fused.some((hit) => hit.id === "d" && hit.sources.includes("graph"))).toBe(true);
  });

  it("expands chunks via 1-hop documented_in relation", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "kg", name: "KG" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const chunkId = "01CHUNKBILLING00000000000001";
    const topicRow = await db
      .insert(kbEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        entityType: "topic",
        name: "billing",
        aliases: ["invoice"],
      })
      .returning();
    const topic = requireRow(topicRow[0], "topic");

    const docRow = await db
      .insert(kbEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        entityType: "document",
        name: "Billing FAQ",
        chunkIds: [chunkId],
      })
      .returning();
    const doc = requireRow(docRow[0], "doc");

    await db.insert(kbRelations).values({
      orgId: org.id,
      brandId: brand.id,
      fromEntityId: topic.id,
      relationType: "documented_in",
      toEntityId: doc.id,
      confidence: 1,
    });

    const expanded = await expandKbChunksFromGraph(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "billing invoice",
    });

    expect(expanded.matchedEntityIds).toContain(topic.id);
    expect(expanded.hits.some((hit) => hit.id === chunkId)).toBe(true);

    await store.close();
  });

  it("includes graph source in hybrid search when graph is seeded", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });
    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const chunkVector = createLibsqlKbChunkVectorStore(store.client);

    const orgRow = await db.insert(organizations).values({ slug: "kg2", name: "KG2" }).returning();
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

    const billingDoc = documents.find((doc) => doc.title === "Billing FAQ");
    expect(billingDoc).toBeDefined();
    const chunkRows = await db
      .select()
      .from(kbChunks)
      .where(eq(kbChunks.documentId, billingDoc?.id ?? ""));
    const chunkId = requireRow(chunkRows[0], "billing chunk").id;

    const topicRow = await db
      .insert(kbEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        entityType: "topic",
        name: "billing",
        aliases: ["invoice"],
      })
      .returning();
    const topic = requireRow(topicRow[0], "topic");

    const docRow = await db
      .insert(kbEntities)
      .values({
        orgId: org.id,
        brandId: brand.id,
        entityType: "document",
        name: "Billing FAQ",
        chunkIds: [chunkId],
      })
      .returning();
    const doc = requireRow(docRow[0], "doc");

    await db.insert(kbRelations).values({
      orgId: org.id,
      brandId: brand.id,
      fromEntityId: topic.id,
      relationType: "documented_in",
      toEntityId: doc.id,
    });

    const result = await searchKbChunks(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "billing",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      limit: 5,
      rerank: false,
    });

    expect(result.hits.some((hit) => hit.sources.includes("graph"))).toBe(true);

    await store.close();
  });
});
