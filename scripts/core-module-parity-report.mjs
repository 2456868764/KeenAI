import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const THRESHOLD = Number(process.env.CORE_MODULE_PARITY_THRESHOLD ?? 0.95);

const criteria = [
  {
    id: "frontend-dashboard-pages",
    group: "frontend",
    label:
      "Dashboard pages cover Inbox, Workflow, Tickets, Feedback, Help Center, Roadmap, Changelog, Directory, Memory, Analytics, Custom Actions, and Settings",
    sourceDocs: ["docs/05-FRONTEND.md", "docs/08-ROADMAP-TODO.md"],
    weight: 12,
    paths: [
      "apps/dashboard/src/app/inbox/page.tsx",
      "apps/dashboard/src/app/workflows/page.tsx",
      "apps/dashboard/src/app/workflows/[id]/page.tsx",
      "apps/dashboard/src/app/tickets/page.tsx",
      "apps/dashboard/src/app/feedback/page.tsx",
      "apps/dashboard/src/app/help-center/page.tsx",
      "apps/dashboard/src/app/roadmap/page.tsx",
      "apps/dashboard/src/app/changelog/page.tsx",
      "apps/dashboard/src/app/directory/page.tsx",
      "apps/dashboard/src/app/memory/page.tsx",
      "apps/dashboard/src/app/analytics/page.tsx",
      "apps/dashboard/src/app/custom-actions/page.tsx",
      "apps/dashboard/src/app/settings/personality/page.tsx",
      "apps/dashboard/src/app/settings/channels/page.tsx",
      "apps/dashboard/src/app/settings/sla/page.tsx",
    ],
  },
  {
    id: "frontend-portal-widget",
    group: "frontend",
    label: "Portal and Widget customer-facing surfaces are implemented",
    sourceDocs: ["docs/05-FRONTEND.md"],
    weight: 10,
    paths: [
      "apps/portal/src/app/feedback/page.tsx",
      "apps/portal/src/app/help/page.tsx",
      "apps/portal/src/app/help/help-search.tsx",
      "apps/portal/src/app/roadmap/page.tsx",
      "apps/portal/src/app/changelog/page.tsx",
      "apps/portal/src/app/tickets/[id]/page.tsx",
      "apps/widget/src/boot.ts",
      "apps/widget/src/messages-panel.ts",
      "apps/widget/src/ws-client.ts",
      "apps/widget/src/boot.test.ts",
      "apps/widget/src/messages-panel.test.ts",
    ],
  },
  {
    id: "rag-kb-core",
    group: "rag",
    label:
      "RAG/KB implements ingest, parsing/chunking, hybrid retrieval, lifecycle, connectors, eval, telemetry, API routes, and release gates",
    sourceDocs: ["docs/11-RAG-KNOWLEDGE.md", "docs/11-RAG-OPTIMIZATION.md"],
    weight: 14,
    paths: [
      "packages/kb/src/ingest/parse-document.ts",
      "packages/kb/src/ingest/chunk-document.ts",
      "packages/kb/src/ingest/index-document.ts",
      "packages/kb/src/retriever/fuse.ts",
      "packages/kb/src/retriever/graph-expand.ts",
      "packages/kb/src/retriever/rerank.ts",
      "packages/kb/src/lifecycle/crystallize.ts",
      "packages/kb/src/lifecycle/reconcile.ts",
      "packages/kb/src/connectors/file-upload.ts",
      "packages/kb/src/connectors/web-crawl.ts",
      "packages/kb/src/connectors/github.ts",
      "packages/kb/src/connectors/notion.ts",
      "packages/kb/src/eval/release-gate.test.ts",
      "packages/kb/src/eval/telemetry-report.ts",
      "apps/api/src/routes/kb.ts",
      "apps/api/src/lib/kb-pipeline.ts",
      "apps/api/src/kb.integration.test.ts",
    ],
    contains: [
      ["packages/kb/src/retriever/fuse.ts", "applyKbSearchPostFuse"],
      ["packages/kb/src/retriever/fuse.ts", "diversifyKbSearchHits"],
      ["packages/kb/src/eval/kb-eval-config.ts", "recall_at_5"],
      ["packages/kb/src/eval/kb-eval-config.ts", "stale_answer_rate_max"],
      ["apps/api/src/lib/kb-pipeline.ts", "kb.syncSource"],
      ["apps/api/src/lib/kb-pipeline.ts", "runKbIngestPipeline"],
    ],
  },
  {
    id: "memory-four-layer-tree",
    group: "memory",
    label:
      "Memory implements four-layer memory, processors, KG extraction, Inngest consolidation, Memory Tree, and Dashboard explorer",
    sourceDocs: ["docs/10-AGENT-MEMORY.md", "docs/15-MEMORY-TREE.md"],
    weight: 14,
    paths: [
      "packages/memory/src/layers.ts",
      "packages/memory/src/processors/pii-filter.ts",
      "packages/memory/src/processors/trajectory-compressor.ts",
      "packages/memory/src/kg/extractor.ts",
      "packages/memory/src/mastra-adapter.ts",
      "packages/memory/src/inngest/functions.ts",
      "packages/memory-tree/src/ingest.ts",
      "packages/memory-tree/src/seal-buffer.ts",
      "packages/memory-tree/src/brand-daily-digest.ts",
      "packages/memory-tree/src/agent-scope-context.ts",
      "packages/memory-tree/src/explorer.ts",
      "apps/api/src/routes/memory.ts",
      "apps/dashboard/src/app/memory/page.tsx",
      "apps/dashboard/src/components/memory/memory-explorer.tsx",
      "apps/dashboard/src/components/memory/memory-tree-panel.tsx",
      "apps/api/src/memory-tree.integration.test.ts",
      "packages/memory-tree/src/memory-tree.test.ts",
    ],
    contains: [
      ["packages/memory/src/layers.ts", "working"],
      ["packages/memory/src/layers.ts", "episodic"],
      ["packages/memory/src/layers.ts", "semantic"],
      ["packages/memory/src/layers.ts", "procedural"],
      ["packages/memory-tree/src/agent-scope-context.ts", "brand_daily"],
    ],
  },
  {
    id: "storage-abstraction",
    group: "storage",
    label:
      "Storage abstraction covers LibSQL/Postgres schemas, vector/FTS stores, hybrid store, and domain schemas",
    sourceDocs: ["docs/07-DATA-MODEL.md", "docs/12-STORAGE-ABSTRACTION.md"],
    weight: 12,
    paths: [
      "packages/storage/src/core/store.ts",
      "packages/storage/src/core/vector-store.ts",
      "packages/storage/src/core/fts-store.ts",
      "packages/storage/src/hybrid.ts",
      "packages/storage/src/libsql/store.ts",
      "packages/storage/src/postgres/store.ts",
      "packages/storage/src/schema/sqlite/conversation.ts",
      "packages/storage/src/schema/sqlite/ticket.ts",
      "packages/storage/src/schema/sqlite/workflow.ts",
      "packages/storage/src/schema/sqlite/kb.ts",
      "packages/storage/src/schema/sqlite/memory-tree.ts",
      "packages/storage/src/schema/sqlite/feedback.ts",
      "packages/storage/src/schema/sqlite/help-center.ts",
      "packages/storage/src/libsql/kb-chunk-fts.ts",
      "packages/storage/src/libsql/kb-chunk-vectors.ts",
      "packages/storage/src/libsql/memory-chunk-fts.ts",
      "packages/storage/src/libsql/memory-chunk-vectors.ts",
      "packages/storage/tests/pg-matrix.test.ts",
      "packages/storage/src/hybrid.test.ts",
    ],
  },
  {
    id: "multimodal-core",
    group: "multimodal",
    label:
      "Multimodal supports message parts, attachments, image/voice/video processing, TTS, image generation, thumbnails, and agent outbound media tools",
    sourceDocs: ["docs/14-MULTIMODAL.md", "docs/09-AGENT-ENGINE.md"],
    weight: 10,
    paths: [
      "packages/shared/src/message-parts.ts",
      "packages/shared/src/outbound-parts.ts",
      "packages/shared/src/attachment-metadata.ts",
      "packages/channels-core/src/parse-agent-response.ts",
      "apps/api/src/lib/attachments.ts",
      "apps/api/src/routes/attachments.ts",
      "apps/api/src/routes/uploads.ts",
      "apps/api/src/lib/media/process-message-media.ts",
      "apps/api/src/lib/media/transcribe.ts",
      "apps/api/src/lib/media/thumbnail.ts",
      "apps/api/src/lib/media/tts.ts",
      "apps/api/src/lib/media/generate-image.ts",
      "apps/api/src/lib/agent-tools/generate-image.ts",
      "apps/api/src/lib/agent-tools/text-to-speech.ts",
      "apps/api/src/multimodal.integration.test.ts",
      "packages/shared/src/message-parts.test.ts",
      "packages/channels-core/src/parse-agent-response.test.ts",
    ],
  },
  {
    id: "agent-engine",
    group: "agent",
    label:
      "Agent engine implements orchestrator, Mastra wrapper, context assembler with KB/Memory, skills, events, post-run hooks, resolution detection, and API integration",
    sourceDocs: ["docs/09-AGENT-ENGINE.md"],
    weight: 13,
    paths: [
      "packages/agent/src/orchestrator.ts",
      "packages/agent/src/mastra-agent.ts",
      "packages/agent/src/run.ts",
      "packages/agent/src/context/assembler.ts",
      "packages/agent/src/skill/discoverer.ts",
      "packages/agent/src/skill/runner.ts",
      "packages/agent/src/events.ts",
      "packages/agent/src/post-run.ts",
      "packages/agent/src/resolution.ts",
      "apps/api/src/routes/copilot.ts",
      "apps/api/src/lib/copilot-context.ts",
      "apps/api/src/lib/agent-outbound.ts",
      "packages/agent/tests/context-assembler.test.ts",
      "packages/agent/tests/run.test.ts",
      "packages/agent/tests/mastra-agent.test.ts",
      "packages/agent/tests/resolution.test.ts",
      "apps/api/src/copilot.integration.test.ts",
    ],
    contains: [
      ["packages/agent/src/context/assembler.ts", "kb"],
      ["packages/agent/src/context/assembler.ts", "memory"],
      ["packages/agent/src/post-run.ts", "detectResolution"],
    ],
  },
  {
    id: "workflow-core",
    group: "workflow",
    label:
      "Workflow implements DSL, triggers, executor, full block set, Inngest timers/functions, API handlers, and Dashboard builder",
    sourceDocs: ["docs/13-WORKFLOW.md"],
    weight: 15,
    paths: [
      "packages/workflow/src/schema.ts",
      "packages/workflow/src/triggers.ts",
      "packages/workflow/src/executor.ts",
      "packages/workflow/src/blocks/branches.ts",
      "packages/workflow/src/blocks/collect-data.ts",
      "packages/workflow/src/blocks/csat.ts",
      "packages/workflow/src/blocks/reply-buttons.ts",
      "packages/workflow/src/blocks/snooze.ts",
      "packages/workflow/src/blocks/tag-conversation.ts",
      "packages/workflow/src/blocks/let-keeni-answer.ts",
      "packages/workflow/src/adapter/inngest.ts",
      "packages/workflow/src/inngest/timers.ts",
      "packages/workflow/src/inngest/functions.ts",
      "apps/api/src/routes/workflows.ts",
      "apps/api/src/lib/workflow-engine.ts",
      "apps/api/src/lib/workflow-handlers.ts",
      "apps/api/src/lib/workflow-timer-handlers.ts",
      "apps/dashboard/src/app/workflows/page.tsx",
      "apps/dashboard/src/app/workflows/[id]/page.tsx",
      "apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx",
      "apps/dashboard/src/components/workflows/workflow-block-editor.tsx",
      "packages/workflow/src/executor.test.ts",
      "apps/api/src/workflow.integration.test.ts",
      "apps/dashboard/src/components/workflows/workflow-graph.test.ts",
    ],
    contains: [
      ["packages/workflow/src/schema.ts", "let_keeni_answer"],
      ["packages/workflow/src/schema.ts", "tag_conversation"],
      ["packages/workflow/src/inngest/timers.ts", "waitForEvent"],
      ["apps/dashboard/src/components/workflows/workflow-block-editor.tsx", "tag_conversation"],
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
  const pathChecks = criterion.paths.map((path) => ({
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

  return {
    ...criterion,
    passed: missingPaths.length === 0 && missingContent.length === 0,
    pathChecks,
    contentChecks,
    missingPaths,
    missingContent,
  };
}

function groupSummary(evaluated) {
  const groups = new Map();
  for (const item of evaluated) {
    const current = groups.get(item.group) ?? {
      group: item.group,
      totalWeight: 0,
      passedWeight: 0,
      totalCriteria: 0,
      passedCriteria: 0,
      failures: [],
    };
    current.totalWeight += item.weight;
    current.totalCriteria += 1;
    if (item.passed) {
      current.passedWeight += item.weight;
      current.passedCriteria += 1;
    } else {
      current.failures.push(item.id);
    }
    groups.set(item.group, current);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    score: group.totalWeight > 0 ? group.passedWeight / group.totalWeight : 0,
  }));
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
  const groupRows = report.groups
    .map(
      (group) =>
        `| ${group.group} | ${(group.score * 100).toFixed(1)}% | ${group.passedCriteria}/${group.totalCriteria} | ${
          group.failures.length > 0 ? group.failures.join("; ") : "none"
        } |`,
    )
    .join("\n");
  const criteriaRows = report.criteria
    .map(
      (item) =>
        `| ${item.id} | ${item.group} | ${item.passed ? "pass" : "fail"} | ${item.weight} | ${
          item.missingPaths.length + item.missingContent.length === 0
            ? "none"
            : [...item.missingPaths, ...item.missingContent].join("; ")
        } |`,
    )
    .join("\n");
  const matrixRows = report.criteria
    .map(
      (item) =>
        `| ${item.id} | ${item.group} | ${item.passed ? "pass" : "fail"} | ${item.sourceDocs
          .map(escapeCell)
          .join("<br>")} | ${escapeCell(item.label)} | ${renderChecks(
          item.pathChecks,
          (check) => check.path,
        )} | ${renderChecks(item.contentChecks, (check) => `${check.path} :: ${check.needle}`)} |`,
    )
    .join("\n");

  return [
    "# Core Module Parity Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| threshold | ${(report.threshold * 100).toFixed(1)}% |`,
    `| score | ${(report.score * 100).toFixed(1)}% |`,
    `| passed_weight | ${report.passedWeight} |`,
    `| total_weight | ${report.totalWeight} |`,
    `| path_checks | ${report.passedPathChecks}/${report.totalPathChecks} |`,
    `| content_probe_checks | ${report.passedContentChecks}/${report.totalContentChecks} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Groups",
    "",
    "| Group | Score | Criteria | Failures |",
    "|-------|-------|----------|----------|",
    groupRows,
    "",
    "## Criteria",
    "",
    "| ID | Group | Status | Weight | Missing |",
    "|----|-------|--------|--------|---------|",
    criteriaRows,
    "",
    "## Design-to-Code Matrix",
    "",
    "| ID | Group | Status | Source docs | Required design scope | Implementation path checks | Content probes |",
    "|----|-------|--------|-------------|-----------------------|----------------------------|----------------|",
    matrixRows,
    "",
  ].join("\n");
}

const evaluated = criteria.map(evaluateCriterion);
const totalWeight = evaluated.reduce((sum, item) => sum + item.weight, 0);
const passedWeight = evaluated
  .filter((item) => item.passed)
  .reduce((sum, item) => sum + item.weight, 0);
const score = totalWeight > 0 ? passedWeight / totalWeight : 0;
const failures = evaluated
  .filter((item) => !item.passed)
  .map((item) => item.id)
  .concat(score < THRESHOLD ? [`score ${score.toFixed(3)} < ${THRESHOLD}`] : []);
const allPathChecks = evaluated.flatMap((item) => item.pathChecks);
const allContentChecks = evaluated.flatMap((item) => item.contentChecks);

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length === 0 ? "pass" : "fail",
  threshold: THRESHOLD,
  score,
  passedWeight,
  totalWeight,
  totalPathChecks: allPathChecks.length,
  passedPathChecks: allPathChecks.filter((check) => check.passed).length,
  totalContentChecks: allContentChecks.length,
  passedContentChecks: allContentChecks.filter((check) => check.passed).length,
  groups: groupSummary(evaluated),
  criteria: evaluated,
  failures,
};

const jsonPath = outputPath("CORE_MODULE_PARITY_REPORT_JSON_OUT", "core-module-parity.json");
const markdownPath = outputPath("CORE_MODULE_PARITY_REPORT_MD", "core-module-parity.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
