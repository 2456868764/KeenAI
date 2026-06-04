import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHelpCenterStubConnector,
  createKeenaiKb,
  createStubKbQueryEmbedder,
} from "@keenai/kb";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbGoldenQueries, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { runKbGoldenEval } from "./run-golden.js";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("Sprint 18 golden eval", () => {
  it("scores retrieval against kb_golden_queries", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const chunkVector = createLibsqlKbChunkVectorStore(store.client);

    const [org] = await db
      .insert(organizations)
      .values({ slug: "golden", name: "Golden" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();

    const kb = createKeenaiKb({ db });
    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org?.id ?? "", brandId: brand?.id ?? "", type: "help_center", name: "Help" })
      .returning();

    await kb.syncSource({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      sourceId: requireRow(source, "source").id,
      connector: createHelpCenterStubConnector(),
    });

    const documents = await kb.listDocuments({ orgId: org?.id ?? "", brandId: brand?.id ?? "" });
    for (const document of documents) {
      await kb.indexDocument({
        orgId: org?.id ?? "",
        brandId: brand?.id ?? "",
        documentId: document.id,
        chunkFtsIndexer: chunkFts,
      });
    }

    const { hits } = await kb.search({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      q: "billing invoice",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      limit: 5,
    });
    const topChunkId = requireRow(hits[0], "hit").chunkId;

    await db.insert(kbGoldenQueries).values({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      query: "billing invoice",
      expectedChunkIds: [topChunkId],
      expectedAnswer: "Billing and invoice policy for your account.",
      tags: ["smoke"],
    });

    const report = await runKbGoldenEval(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      maxCases: 10,
      config: {
        thresholds: {
          recallAt5Min: 0,
          mrrMin: 0,
          hitRateMin: 0,
          faithfulnessMin: 0,
          contextualRecallMin: 0,
        },
        nightlyMaxCases: 10,
        smokeMaxCases: 10,
      },
      search: {
        chunkFts,
        chunkVector,
        queryEmbedder: createStubKbQueryEmbedder(),
        rerank: false,
      },
    });

    expect(report.caseCount).toBe(1);
    expect(report.recallAt5).toBeGreaterThan(0);
    expect(report.hitRate).toBe(1);
    expect(report.passed).toBe(true);

    await store.close();
  });
});
