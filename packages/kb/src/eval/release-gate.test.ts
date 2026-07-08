import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHelpCenterStubConnector,
  createKbQueryLog,
  createKeenaiKb,
  createStubKbQueryEmbedder,
  setKbQueryLogFeedback,
} from "@keenai/kb";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbGoldenQueries, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { loadKbEvalConfig } from "./kb-eval-config.js";
import { runKbEvalSuite } from "./runner.js";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("v0.2.0 KB release gate", () => {
  it("passes Recall@5 and stale-answer thresholds on the local golden fixture", async () => {
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
      .values({ slug: "release-gate", name: "Release Gate" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [source] = await db
      .insert(kbSources)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id ?? "",
        type: "help_center",
        name: "Help",
      })
      .returning();

    const kb = createKeenaiKb({ db });
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
    const topHit = requireRow(hits[0], "hit");

    await db.insert(kbGoldenQueries).values({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      query: "billing invoice",
      expectedChunkIds: [topHit.chunkId],
      expectedAnswer:
        "Go to Data Management and click Export. Pro plan invoices are emailed monthly.",
      tags: ["v0.2.0-release"],
    });

    for (let i = 0; i < 100; i++) {
      const log = await createKbQueryLog(db, {
        orgId: org?.id ?? "",
        brandId: brand?.id ?? "",
        queryText: i === 0 ? "old billing policy" : "billing invoice",
        hits: [{ chunkId: topHit.chunkId, fusedScore: 1 }],
        latencyMs: 8,
      });
      await setKbQueryLogFeedback(db, {
        orgId: org?.id ?? "",
        logId: log.id,
        feedback: i === 0 ? "not_helpful" : "helpful",
      });
    }

    const config = loadKbEvalConfig();
    const report = await runKbEvalSuite(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      maxCases: config.smokeMaxCases,
      config,
      search: {
        chunkFts,
        chunkVector,
        queryEmbedder: createStubKbQueryEmbedder(),
        rerank: false,
      },
    });

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.golden.recallAt5).toBeGreaterThanOrEqual(config.thresholds.recallAt5Min);
    expect(report.lifecycle.staleAnswerRate).toBeLessThan(config.thresholds.staleAnswerRateMax);

    await store.close();
  });
});
