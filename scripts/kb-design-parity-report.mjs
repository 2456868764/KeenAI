#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const criteria = [
  {
    id: "KB-01",
    title: "@keenai/kb package skeleton + kb_documents schema",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md", "docs/08-ROADMAP-TODO.md"],
    paths: ["packages/kb/src/index.ts", "packages/storage/src/schema/sqlite/kb.ts"],
    contains: [
      ["packages/kb/src/index.ts", "createKeenaiKb"],
      ["packages/storage/src/schema/sqlite/kb.ts", "kbDocuments"],
    ],
  },
  {
    id: "KB-02",
    title: "Source connectors baseline",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md"],
    paths: [
      "packages/kb/src/connectors/types.ts",
      "packages/kb/src/connectors/help-center-stub.ts",
      "packages/kb/src/connectors/web-stub.ts",
      "packages/kb/src/connectors/file-upload.ts",
      "packages/kb/src/connectors/web-crawl.ts",
      "packages/kb/src/connectors/github.ts",
      "packages/kb/src/connectors/notion.ts",
    ],
    contains: [["packages/kb/src/connectors/index.ts", "resolveKbConnectorForSource"]],
  },
  {
    id: "KB-SOURCES-EXTENDED",
    title: "All design-listed source connectors",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §3.1"],
    paths: [
      "packages/kb/src/connectors/file-upload.ts",
      "packages/kb/src/connectors/web-crawl.ts",
      "packages/kb/src/connectors/github.ts",
      "packages/kb/src/connectors/notion.ts",
    ],
    missingByDesign: [
      "past_conversations connector",
      "feedback connector",
      "changelog connector",
      "roadmap connector",
      "confluence connector",
      "google_drive connector",
      "slack source connector",
      "discord source connector",
      "linear connector",
      "jira connector",
      "youtube transcript connector",
      "sql table connector",
    ],
  },
  {
    id: "KB-03",
    title: "Ingestion parse/chunk/embed pipeline",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §4"],
    paths: [
      "packages/kb/src/ingest/parse-document.ts",
      "packages/kb/src/ingest/chunk-document.ts",
      "packages/kb/src/ingest/embedder.ts",
      "packages/kb/src/ingest/index-document.ts",
    ],
    contains: [
      ["packages/kb/src/ingest/index-document.ts", "parseKbDocument"],
      ["packages/kb/src/ingest/index-document.ts", "chunkKbDocument"],
      ["packages/kb/src/ingest/index-document.ts", "embedKbChunk"],
    ],
  },
  {
    id: "KB-04",
    title: "Hybrid retriever with FTS + Vector RRF",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §5"],
    paths: ["packages/kb/src/search-kb-chunks.ts", "packages/kb/src/retriever/graph-expand.ts"],
    contains: [
      ["packages/kb/src/search-kb-chunks.ts", "fuseKbChunkRankings"],
      ["packages/kb/src/search-kb-chunks.ts", "chunkFts.search"],
      ["packages/kb/src/search-kb-chunks.ts", "chunkVector.query"],
    ],
  },
  {
    id: "KB-05",
    title: "KB search API",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md", "docs/08-ROADMAP-TODO.md"],
    paths: ["apps/api/src/routes/kb.ts", "apps/api/src/kb.integration.test.ts"],
    contains: [
      ["apps/api/src/routes/kb.ts", "r.get(`${prefix}/search`"],
      ["apps/api/src/routes/kb.ts", "searchKbChunks"],
    ],
  },
  {
    id: "KB-06",
    title: "Agent context injects KB chunks",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §17"],
    paths: [
      "packages/agent/src/context/assembler.ts",
      "packages/agent/tests/context-assembler.test.ts",
    ],
    contains: [
      ["packages/agent/src/context/assembler.ts", "kbSearch"],
      ["packages/agent/src/context/assembler.ts", "kb"],
    ],
  },
  {
    id: "KB-07",
    title: "bge-m3 real embedder",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §3"],
    paths: ["packages/kb/src/ingest/embedder.ts", "packages/kb/src/embed-query.ts"],
    contains: [
      ["packages/kb/src/ingest/embedder.ts", "Xenova/bge-m3"],
      ["packages/kb/src/ingest/embedder.ts", "BGE_M3_DIMENSIONS = 1024"],
    ],
  },
  {
    id: "KB-08",
    title: "bge reranker with rerank=false support",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §3"],
    paths: ["packages/kb/src/retriever/rerank.ts", "packages/kb/src/retriever/rerank.test.ts"],
    contains: [
      ["packages/kb/src/search-kb-chunks.ts", "rerank?: boolean"],
      ["packages/kb/src/retriever/rerank.ts", "bge-reranker-v2-m3"],
    ],
  },
  {
    id: "KB-09",
    title: "KG entity-link expansion",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §3", "docs/11-RAG-KNOWLEDGE.md §6"],
    paths: [
      "packages/kb/src/retriever/graph-expand.ts",
      "packages/kb/src/retriever/graph-expand.test.ts",
    ],
    contains: [
      ["packages/kb/src/retriever/graph-expand.ts", "KB_RRF_WEIGHTS_DEFAULT"],
      ["packages/kb/src/retriever/graph-expand.ts", "documented_in"],
    ],
  },
  {
    id: "KB-10",
    title: "Hierarchical chunk hydrate",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §3"],
    paths: ["packages/kb/src/retriever/hydrate.ts", "packages/kb/src/retriever/hydrate.test.ts"],
    contains: [["packages/kb/src/search-kb-chunks.ts", "hydrateKbSearchHits"]],
  },
  {
    id: "KB-11",
    title: "Diversity + recency post-fuse ranking",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §3"],
    paths: ["packages/kb/src/retriever/fuse.ts", "packages/kb/src/retriever/fuse.test.ts"],
    contains: [
      ["packages/kb/src/retriever/fuse.ts", "diversifyKbSearchHits"],
      ["packages/kb/src/retriever/fuse.ts", "applyKbSearchPostFuse"],
    ],
  },
  {
    id: "KB-12",
    title: "kb_query_logs + helpful/not_helpful API",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §3"],
    paths: [
      "packages/kb/src/query-log.ts",
      "packages/kb/src/query-log.test.ts",
      "apps/api/src/routes/kb.ts",
    ],
    contains: [
      ["packages/storage/src/schema/sqlite/kb.ts", "kbQueryLogs"],
      ["apps/api/src/routes/kb.ts", "r.post(\n    `${prefix}/search/:id/feedback`"],
    ],
  },
  {
    id: "KB-13",
    title: "Evidence-based confidence + provenance",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §4"],
    paths: [
      "packages/kb/src/lifecycle/confidence.ts",
      "packages/kb/src/lifecycle/provenance.ts",
      "packages/kb/src/lifecycle/confidence.test.ts",
    ],
    contains: [
      ["packages/kb/src/ingest/index-document.ts", "buildKbChunkProvenance"],
      ["packages/kb/src/ingest/index-document.ts", "computeKbChunkConfidence"],
    ],
  },
  {
    id: "KB-14",
    title: "Supersession chain + active/superseded/archived",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §4"],
    paths: [
      "packages/kb/src/lifecycle/supersession.ts",
      "packages/kb/src/lifecycle/supersession.test.ts",
    ],
    contains: [
      ["packages/storage/src/schema/sqlite/kb.ts", "supersedesDocumentId"],
      ["packages/kb/src/lifecycle/supersession.ts", "superseded"],
    ],
  },
  {
    id: "KB-15",
    title: "Freshness rules -> retrieval weight",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §8", "docs/11-RAG-OPTIMIZATION.md §4"],
    paths: [
      "packages/kb/config/kb-freshness.yaml",
      "packages/kb/src/lifecycle/freshness.ts",
      "packages/kb/src/lifecycle/freshness.test.ts",
    ],
    contains: [
      ["packages/kb/src/retriever/fuse.ts", "resolveKbRecencyHalfLifeDays"],
      ["packages/kb/src/retriever/fuse.ts", "halfLifeDays"],
    ],
  },
  {
    id: "KB-16",
    title: "Inngest 8-stage ingestion pipeline",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §4.2", "docs/11-RAG-OPTIMIZATION.md §4"],
    paths: [
      "packages/kb/src/inngest/kb-ingest.ts",
      "packages/kb/src/inngest/kb-ingest-pipeline.ts",
      "apps/api/src/lib/kb-inngest.ts",
      "packages/kb/src/inngest/kb-ingest.test.ts",
    ],
    contains: [
      ["packages/kb/src/inngest/kb-ingest-pipeline.ts", "fetch"],
      ["packages/kb/src/inngest/kb-ingest-pipeline.ts", "notify"],
      ["packages/kb/src/inngest/kb-ingest.ts", "concurrency"],
    ],
  },
  {
    id: "KB-17",
    title: "content_hash diff incremental indexing",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §4"],
    paths: ["packages/kb/src/ingest/diff-index.ts", "packages/kb/src/ingest/diff-index.test.ts"],
    contains: [
      ["packages/kb/src/ingest/diff-index.ts", "hashKbChunkContent"],
      ["packages/kb/src/ingest/index-document.ts", "diffIndex"],
    ],
  },
  {
    id: "KB-18",
    title: "Parsers + semantic/hierarchical/contextual chunkers",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §4.1", "docs/11-RAG-OPTIMIZATION.md §4"],
    paths: [
      "packages/kb/src/ingest/parsers/markdown.ts",
      "packages/kb/src/ingest/parsers/pdf.ts",
      "packages/kb/src/ingest/parsers/docx.ts",
      "packages/kb/src/ingest/chunkers/hierarchical.ts",
      "packages/kb/src/ingest/index-document.test.ts",
    ],
    contains: [
      ["packages/kb/src/ingest/parse-document.ts", "extractPdfText"],
      ["packages/kb/src/ingest/parse-document.ts", "extractDocxText"],
      ["packages/kb/src/ingest/index-document.test.ts", "parseKbPdfDocument"],
      ["packages/kb/src/ingest/index-document.test.ts", "parseKbDocxDocument"],
    ],
  },
  {
    id: "KG-05",
    title: "kb_entities / kb_relations + ingest extractor",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §6", "docs/11-RAG-OPTIMIZATION.md §6"],
    paths: [
      "packages/kb/src/ingest/extract-kb-entities.ts",
      "packages/kb/src/retriever/graph-expand.ts",
    ],
    contains: [
      ["packages/storage/src/schema/sqlite/kb.ts", "kbEntities"],
      ["packages/storage/src/schema/sqlite/kb.ts", "kbRelations"],
    ],
  },
  {
    id: "KB-19",
    title: "Crystallization pipeline",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §5"],
    paths: [
      "packages/kb/src/lifecycle/crystallize.ts",
      "packages/kb/src/lifecycle/crystallize.test.ts",
      "apps/api/src/lib/kb-dispatch.ts",
    ],
    contains: [
      ["packages/kb/src/lifecycle/crystallize.ts", "auto_index"],
      ["apps/api/src/lib/kb-dispatch.ts", "conversation.closed"],
    ],
  },
  {
    id: "KB-20",
    title: "Contradiction reconcile + supersession proposal",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §5"],
    paths: [
      "packages/kb/src/lifecycle/reconcile.ts",
      "packages/kb/src/lifecycle/reconcile.test.ts",
    ],
    contains: [
      ["packages/storage/src/schema/sqlite/kb.ts", "kbSupersessionProposals"],
      ["packages/kb/src/lifecycle/reconcile.ts", "proposal"],
    ],
  },
  {
    id: "KB-21",
    title: "Brand KB schema",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §5"],
    paths: ["packages/kb/src/schema/brand-kb-schema.ts"],
    contains: [
      ["packages/kb/src/schema/brand-kb-schema.ts", "entityTypes"],
      ["packages/kb/src/schema/brand-kb-schema.ts", "qualityGates"],
      ["packages/kb/src/schema/brand-kb-schema.ts", "retrieval"],
    ],
  },
  {
    id: "KB-22",
    title: "Unified context orchestrator",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §17.1", "docs/11-RAG-OPTIMIZATION.md §5"],
    paths: [
      "packages/agent/src/context/assembler.ts",
      "packages/agent/tests/context-assembler.test.ts",
    ],
    contains: [
      ["packages/agent/src/context/assembler.ts", "assembleUnifiedAgentContext"],
      ["packages/agent/src/context/assembler.ts", "sourceWeight"],
    ],
  },
  {
    id: "KB-23",
    title: "Eval loop + lifecycle metrics",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md §10", "docs/11-RAG-OPTIMIZATION.md §5"],
    paths: [
      "packages/kb/src/eval/runner.ts",
      "packages/kb/src/eval/telemetry-report.ts",
      "packages/kb/src/eval/run-golden.ts",
      "packages/kb/src/eval/release-gate.test.ts",
    ],
    contains: [
      ["packages/kb/src/eval/runner.ts", "runKbEvalSuite"],
      ["packages/kb/src/eval/telemetry-report.ts", "staleAnswerRate"],
      ["packages/kb/src/eval/run-golden.ts", "graphContributionRate"],
    ],
  },
  {
    id: "KB-24",
    title: "Memory Tree hotness -> crystallize priority",
    sourceDocs: ["docs/11-RAG-OPTIMIZATION.md §5"],
    paths: [
      "packages/kb/src/lifecycle/crystallize-priority.ts",
      "packages/kb/src/lifecycle/crystallize-priority.test.ts",
    ],
    contains: [
      ["packages/kb/src/lifecycle/crystallize-priority.ts", "memoryHotness"],
      ["packages/kb/src/lifecycle/crystallize-priority.ts", "priority"],
    ],
  },
];

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function fileContains(relativePath, needle) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf8").includes(needle);
}

function evaluateCriterion(criterion) {
  const pathChecks = (criterion.paths ?? []).map((path) => ({
    path,
    passed: existsSync(join(ROOT, path)),
  }));
  const contentChecks = (criterion.contains ?? []).map(([path, needle]) => ({
    path,
    needle,
    passed: fileContains(path, needle),
  }));
  const missingPaths = pathChecks.filter((check) => !check.passed).map((check) => check.path);
  const missingContent = contentChecks
    .filter((check) => !check.passed)
    .map((check) => `${check.path} missing ${check.needle}`);
  const missingByDesign = criterion.missingByDesign ?? [];

  return {
    ...criterion,
    state:
      missingPaths.length === 0 && missingContent.length === 0 && missingByDesign.length === 0
        ? "done"
        : missingByDesign.length > 0 && missingPaths.length === 0 && missingContent.length === 0
          ? "partial"
          : "missing",
    pathChecks,
    contentChecks,
    missingPaths,
    missingContent,
    missingByDesign,
  };
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function renderChecks(checks, formatter) {
  if (checks.length === 0) return "none";
  return checks
    .map((check) => `${check.passed ? "pass" : "missing"}: ${formatter(check)}`)
    .map(escapeCell)
    .join("<br>");
}

function renderMarkdown(report) {
  const rows = report.criteria
    .map(
      (item) =>
        `| ${item.id} | ${item.state} | ${escapeCell(item.title)} | ${item.sourceDocs
          .map(escapeCell)
          .join("<br>")} | ${renderChecks(item.pathChecks, (check) => check.path)} | ${renderChecks(
          item.contentChecks,
          (check) => `${check.path} :: ${check.needle}`,
        )} | ${
          item.missingByDesign.length > 0
            ? item.missingByDesign.map(escapeCell).join("<br>")
            : "none"
        } |`,
    )
    .join("\n");

  return [
    "# KB Design Parity Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| total_items | ${report.totalItems} |`,
    `| done_items | ${report.doneItems} |`,
    `| partial_items | ${report.partialItems} |`,
    `| missing_items | ${report.missingItems} |`,
    `| path_checks | ${report.passedPathChecks}/${report.totalPathChecks} |`,
    `| content_probe_checks | ${report.passedContentChecks}/${report.totalContentChecks} |`,
    `| blockers | ${report.blockers.length > 0 ? report.blockers.join("; ") : "none"} |`,
    "",
    "## Design Items",
    "",
    "| ID | State | Design requirement | Source docs | Implementation path checks | Content probes | Remaining design gaps |",
    "|----|-------|--------------------|-------------|----------------------------|----------------|-----------------------|",
    rows,
    "",
  ].join("\n");
}

const evaluated = criteria.map(evaluateCriterion);
const pathChecks = evaluated.flatMap((item) => item.pathChecks);
const contentChecks = evaluated.flatMap((item) => item.contentChecks);
const blockers = evaluated.filter((item) => item.state !== "done").map((item) => item.id);

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: evaluated.some((item) => item.state === "missing")
    ? "fail"
    : blockers.length > 0
      ? "partial"
      : "pass",
  totalItems: evaluated.length,
  doneItems: evaluated.filter((item) => item.state === "done").length,
  partialItems: evaluated.filter((item) => item.state === "partial").length,
  missingItems: evaluated.filter((item) => item.state === "missing").length,
  totalPathChecks: pathChecks.length,
  passedPathChecks: pathChecks.filter((check) => check.passed).length,
  totalContentChecks: contentChecks.length,
  passedContentChecks: contentChecks.filter((check) => check.passed).length,
  blockers,
  criteria: evaluated,
};

const jsonPath = outputPath("KB_DESIGN_PARITY_REPORT_JSON_OUT", "kb-design-parity.json");
const markdownPath = outputPath("KB_DESIGN_PARITY_REPORT_MD", "kb-design-parity.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") process.exitCode = 1;
