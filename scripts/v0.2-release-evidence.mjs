import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = process.env.RELEASE_EVIDENCE_DIR ?? "artifacts/release";
const outputPath = join(outputDir, "v0.2.0-evidence.md");

function row(label, value) {
  return `| ${label} | ${value ?? "n/a"} |`;
}

function loadTelemetryReport() {
  const reportPath = process.env.KB_TELEMETRY_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadKbEvalReport() {
  const reportPath = process.env.KB_EVAL_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadOllamaOfflineReport() {
  const reportPath = process.env.OLLAMA_OFFLINE_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function telemetrySection(report) {
  if (!report) {
    return [
      "## KB Production Telemetry",
      "",
      "No KB telemetry report was attached. Set `KB_TELEMETRY_REPORT_JSON` to a JSON report generated from `buildKbTelemetryReport` when production or production-like query logs are available.",
      "",
    ];
  }

  return [
    "## KB Production Telemetry",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("org_id", report.orgId),
    row("brand_id", report.brandId),
    row("window_since", report.window?.since),
    row("window_until", report.window?.until),
    row("total_queries", report.totalQueries),
    row("feedback_coverage", report.feedbackCoverageRate?.toFixed?.(3)),
    row("stale_answer_rate", report.staleAnswerRate?.toFixed?.(3)),
    row("latency_p95_ms", report.latency?.p95Ms),
    row("empty_result_rate", report.emptyResultRate?.toFixed?.(3)),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function kbEvalSection(report) {
  if (!report) {
    return [
      "## KB Local Eval Report",
      "",
      "No local KB eval report was attached. Run `pnpm kb:eval:report` and pass `KB_EVAL_REPORT_JSON=artifacts/release/kb-eval-report.json` to embed P3-ACC-04/P3-ACC-05 evidence.",
      "",
    ];
  }

  const pct = (value) => (value === null || value === undefined ? "n/a" : value.toFixed(3));

  return [
    "## KB Local Eval Report",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("case_count", report.golden?.caseCount),
    row("recall_at_5", pct(report.golden?.recallAt5)),
    row("mrr", pct(report.golden?.mrr)),
    row("hit_rate", pct(report.golden?.hitRate)),
    row("avg_faithfulness", pct(report.golden?.avgFaithfulness)),
    row("avg_contextual_recall", pct(report.golden?.avgContextualRecall)),
    row("stale_answer_rate", pct(report.lifecycle?.staleAnswerRate)),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function ollamaOfflineSection(report) {
  if (!report) {
    return [
      "## Ollama Offline Demo",
      "",
      "No Ollama offline demo report was attached. Run `pnpm ollama:offline:demo` and pass `OLLAMA_OFFLINE_REPORT_JSON=artifacts/release/ollama-offline-demo.json` to embed P3-ACC-02 evidence.",
      "",
    ];
  }

  return [
    "## Ollama Offline Demo",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("provider", report.providerId),
    row("model", report.model),
    row("configured_providers", report.configuredProviders?.join(", ")),
    row("request_count", report.requestCount),
    row("remote_keys_present", report.remoteKeysPresent ? "yes" : "no"),
    row("response_text", report.responseText),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

mkdirSync(outputDir, { recursive: true });

const gitSha = process.env.GITHUB_SHA ?? process.env.GIT_SHA ?? "local";
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "local";

const generatedAt = new Date().toISOString();
const telemetryReport = loadTelemetryReport();
const kbEvalReport = loadKbEvalReport();
const ollamaOfflineReport = loadOllamaOfflineReport();
const body = [
  "# KeenAI v0.2.0 Release Evidence",
  "",
  `Generated: ${generatedAt}`,
  "",
  "## Build Context",
  "",
  "| Field | Value |",
  "|-------|-------|",
  row("git_sha", gitSha),
  row("run_url", runUrl),
  row("node", process.version),
  row("ci", process.env.CI ?? "false"),
  "",
  "## Gates Covered By CI",
  "",
  "| Gate | Command | Evidence status |",
  "|------|---------|-----------------|",
  "| P0 verify | `pnpm verify:p0` | CI job must pass |",
  "| Lint | `pnpm lint` | CI job must pass |",
  "| Tests / coverage | `pnpm test:coverage` | CI job must pass |",
  "| KB eval | `pnpm kb:eval` | CI job must pass |",
  "| Local KB P95 | `pnpm kb:bench:local` | CI job must pass |",
  "| API KB P95 | `pnpm kb:bench:api:local` | CI job must pass and upload `kb-api-bench.md` |",
  "| Typecheck | `pnpm typecheck` | CI job must pass |",
  "| API binary | `pnpm verify:api-binary` | CI job must pass |",
  "| Alpha acceptance | `pnpm alpha:acceptance` | CI job must pass |",
  "",
  ...ollamaOfflineSection(ollamaOfflineReport),
  ...kbEvalSection(kbEvalReport),
  ...telemetrySection(telemetryReport),
  "## Gates Requiring External Artifacts",
  "",
  "- API-level `pnpm kb:bench` P95 from the deployed service.",
  "- Real `ollama serve` + local model runtime evidence for final P3-ACC-02 acceptance.",
  "- Production faithfulness / Recall@5 / stale-answer telemetry from live or production-like golden data.",
  "- GHCR `0.2.0` image publish run.",
  "- Helm install artifact against a reachable Kubernetes cluster.",
  "- Rendered and uploaded YouTube / Bilibili tutorial video links.",
  "- `pnpm release:verify-external` passing with `artifacts/release/v0.2.0-external-evidence.json` before tagging.",
  "",
].join("\n");

writeFileSync(outputPath, body);
console.log(`wrote ${outputPath}`);
