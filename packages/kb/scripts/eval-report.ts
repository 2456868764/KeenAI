import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbGoldenQueries, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { loadKbEvalConfig, runKbEvalSuite } from "../src/eval/index.js";
import {
  createHelpCenterStubConnector,
  createKbQueryLog,
  createKeenaiKb,
  createStubKbQueryEmbedder,
  setKbQueryLogFeedback,
} from "../src/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

function outputPath(envName: string, fallback: string): string {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(report: Awaited<ReturnType<typeof buildReport>>): string {
  return [
    "# KB Eval Release Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| passed | ${report.passed ? "yes" : "no"} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    `| case_count | ${report.golden.caseCount} |`,
    `| recall_at_5 | ${pct(report.golden.recallAt5)} |`,
    `| hit_rate_at_5 | ${pct(report.golden.hitRate)} |`,
    `| mrr | ${report.golden.mrr.toFixed(3)} |`,
    `| avg_faithfulness | ${pct(report.golden.avgFaithfulness)} |`,
    `| avg_contextual_recall | ${pct(report.golden.avgContextualRecall)} |`,
    `| stale_answer_rate | ${pct(report.lifecycle.staleAnswerRate)} |`,
    "",
    "## Thresholds",
    "",
    "| Metric | Threshold |",
    "|--------|-----------|",
    `| recall_at_5_min | ${pct(report.thresholds.recallAt5Min)} |`,
    `| mrr_min | ${report.thresholds.mrrMin.toFixed(3)} |`,
    `| hit_rate_min | ${pct(report.thresholds.hitRateMin)} |`,
    `| faithfulness_min | ${pct(report.thresholds.faithfulnessMin)} |`,
    `| contextual_recall_min | ${pct(report.thresholds.contextualRecallMin)} |`,
    `| stale_answer_rate_max | ${pct(report.thresholds.staleAnswerRateMax)} |`,
    "",
  ].join("\n");
}

async function buildReport() {
  const store = createLibsqlStore({ url: ":memory:" });

  try {
    const db = store.db;
    await migrate(db, { migrationsFolder: MIGRATIONS_PATH });

    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const chunkVector = createLibsqlKbChunkVectorStore(store.client);

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "release-eval-report", name: "Release Eval Report" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [sourceRow] = await db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "help_center",
        name: "Help",
      })
      .returning();
    const source = requireRow(sourceRow, "source");

    const kb = createKeenaiKb({ db });
    await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: source.id,
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

    const { hits } = await kb.search({
      orgId: org.id,
      brandId: brand.id,
      q: "billing invoice",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      limit: 5,
    });
    const topHit = requireRow(hits[0], "hit");

    await db.insert(kbGoldenQueries).values({
      orgId: org.id,
      brandId: brand.id,
      query: "billing invoice",
      expectedChunkIds: [topHit.chunkId],
      expectedAnswer:
        "Go to Data Management and click Export. Pro plan invoices are emailed monthly.",
      tags: ["v0.2.0-release"],
    });

    for (let i = 0; i < 100; i++) {
      const log = await createKbQueryLog(db, {
        orgId: org.id,
        brandId: brand.id,
        queryText: i === 0 ? "old billing policy" : "billing invoice",
        hits: [{ chunkId: topHit.chunkId, fusedScore: 1 }],
        latencyMs: 8,
      });
      await setKbQueryLogFeedback(db, {
        orgId: org.id,
        logId: log.id,
        feedback: i === 0 ? "not_helpful" : "helpful",
      });
    }

    const config = loadKbEvalConfig();
    const report = await runKbEvalSuite(db, {
      orgId: org.id,
      brandId: brand.id,
      maxCases: config.smokeMaxCases,
      config,
      search: {
        chunkFts,
        chunkVector,
        queryEmbedder: createStubKbQueryEmbedder(),
        rerank: false,
      },
    });

    return {
      generatedAt: new Date().toISOString(),
      evidenceStatus: report.passed ? "pass" : "fail",
      passed: report.passed,
      failures: report.failures,
      thresholds: config.thresholds,
      lifecycle: report.lifecycle,
      golden: {
        caseCount: report.golden.caseCount,
        recallAt5: report.golden.recallAt5,
        recallAt10: report.golden.recallAt10,
        mrr: report.golden.mrr,
        hitRate: report.golden.hitRate,
        graphContributionRate: report.golden.graphContributionRate,
        avgFaithfulness: report.golden.avgFaithfulness,
        avgAnswerRelevance: report.golden.avgAnswerRelevance,
        avgContextualRecall: report.golden.avgContextualRecall,
        passed: report.golden.passed,
        failures: report.golden.failures,
      },
    };
  } finally {
    await store.close();
  }
}

const report = await buildReport();
const jsonPath = outputPath("KB_EVAL_REPORT_JSON_OUT", "kb-eval-report.json");
const markdownPath = outputPath("KB_EVAL_REPORT_MD", "kb-eval-report.md");

writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (!report.passed) {
  process.exitCode = 1;
}
