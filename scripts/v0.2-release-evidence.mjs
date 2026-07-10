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

function loadDockerLiteStartupReport() {
  const reportPath = process.env.DOCKER_LITE_STARTUP_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadCopilotAdoptionReport() {
  const reportPath = process.env.COPILOT_ADOPTION_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadSupportFlowReport() {
  const reportPath = process.env.SUPPORT_FLOW_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadCustomerReachabilityReport() {
  const reportPath = process.env.CUSTOMER_REACHABILITY_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadWidgetRuntimeReport() {
  const reportPath = process.env.WIDGET_RUNTIME_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadAutoResolutionReport() {
  const reportPath = process.env.AUTO_RESOLUTION_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadFeaturebaseParityReport() {
  const reportPath = process.env.FEATUREBASE_PARITY_REPORT_JSON;
  if (!reportPath) return null;
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function loadQualityGateReport() {
  const reportPath = process.env.QUALITY_GATE_REPORT_JSON;
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

function dockerLiteStartupSection(report) {
  if (!report) {
    return [
      "## Docker Lite Startup",
      "",
      "No Docker lite startup report was attached. Run `pnpm docker:lite:startup-report` in a Docker-enabled release environment, or `DOCKER_LITE_STARTUP_DRY_RUN=true pnpm docker:lite:startup-report` for CI-safe compose validation.",
      "",
    ];
  }

  return [
    "## Docker Lite Startup",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("mode", report.mode),
    row("docker_available", report.docker?.available ? "yes" : "no"),
    row("api_health_ms", report.timing?.apiHealthMs ?? "n/a"),
    row("db_health_ms", report.timing?.dbHealthMs ?? "n/a"),
    row("db_after_api_ms", report.timing?.dbAfterApiMs ?? "n/a"),
    row("startup_threshold_ms", report.thresholds?.startupMs),
    row("db_threshold_ms", report.thresholds?.dbMs),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function copilotAdoptionSection(report) {
  if (!report) {
    return [
      "## Copilot Adoption",
      "",
      "No Copilot adoption report was attached. Run `pnpm copilot:adoption:report` against production or production-like `copilot_events`, or `pnpm copilot:adoption:report --fixture` for CI-safe report validation.",
      "",
    ];
  }

  const pct = (value) => (value === null || value === undefined ? "n/a" : value.toFixed(3));
  return [
    "## Copilot Adoption",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("mode", report.mode),
    row("total_events", report.totalEvents),
    row("accept_rate", pct(report.acceptRate)),
    row("used_rate_accept_or_edit", pct(report.usedRate)),
    row("accept_rate_threshold", pct(report.thresholds?.acceptRateMin)),
    row("min_events", report.thresholds?.minEvents),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function supportFlowSection(report) {
  if (!report) {
    return [
      "## Internal Support Flow",
      "",
      "No internal support flow report was attached. Run `pnpm support:flow:report` to validate login, inbox, reply, assign, and close through the in-process API.",
      "",
    ];
  }

  return [
    "## Internal Support Flow",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("mode", report.mode),
    row("conversation_id", report.conversationId),
    row("reply_message_id", report.replyMessageId),
    row("final_status", report.finalConversationStatus),
    row("inbox_count", report.inboxCount),
    row("message_count", report.messageCount),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function customerReachabilitySection(report) {
  if (!report) {
    return [
      "## Customer Reachability",
      "",
      "No customer reachability report was attached. Run `pnpm customer:reachability:report` to validate Widget HMAC conversation creation, email webhook ingest/threading, and agent inbox visibility through the in-process API.",
      "",
    ];
  }

  return [
    "## Customer Reachability",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("mode", report.mode),
    row("widget_conversation_id", report.widget?.conversationId),
    row("widget_message_count", report.widget?.messageCount),
    row("email_conversation_id", report.email?.conversationId),
    row("email_message_count", report.email?.messageCount),
    row("email_thread_match", report.email?.threadMatchReason),
    row("inbox_count", report.inbox?.count),
    row("widget_visible_in_inbox", report.inbox?.widgetVisible ? "yes" : "no"),
    row("email_visible_in_inbox", report.inbox?.emailVisible ? "yes" : "no"),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function widgetRuntimeSection(report) {
  if (!report) {
    return [
      "## Widget Runtime",
      "",
      "No widget runtime report was attached. Run `pnpm widget:runtime:report` to validate the embed boot path, launcher, Widget API calls, WebSocket connection, and customer message rendering in a jsdom fixture.",
      "",
    ];
  }

  const passedChecks = Object.values(report.checks ?? {}).filter(Boolean).length;
  const totalChecks = Object.keys(report.checks ?? {}).length;
  return [
    "## Widget Runtime",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("mode", report.mode),
    row("checks", `${passedChecks}/${totalChecks}`),
    row("api_calls", report.apiCalls?.length),
    row(
      "websocket_connections",
      report.websocketEvents?.filter((event) => event.type === "connect").length,
    ),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function autoResolutionSection(report) {
  if (!report) {
    return [
      "## Auto Resolution",
      "",
      "No auto resolution report was attached. Run `pnpm auto:resolution:report --fixture` for CI-safe validation or `pnpm auto:resolution:report` with `DATABASE_URL` against production/prod-like closed conversations.",
      "",
    ];
  }

  const pct = (value) => (value === null || value === undefined ? "n/a" : value.toFixed(3));
  return [
    "## Auto Resolution",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("mode", report.mode),
    row("total_closed_conversations", report.totalClosedConversations),
    row("automated_resolved_conversations", report.automatedResolvedConversations),
    row("auto_resolution_rate", pct(report.autoResolutionRate)),
    row("threshold", pct(report.thresholds?.autoResolutionRateMin)),
    row("min_closed_conversations", report.thresholds?.minClosedConversations),
    row("confirmed", report.byResolution?.confirmed),
    row("assumed", report.byResolution?.assumed),
    row("unresolved", report.byResolution?.unresolved),
    row("escalated", report.byResolution?.escalated),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function featurebaseParitySection(report) {
  if (!report) {
    return [
      "## Featurebase Parity",
      "",
      "No Featurebase parity report was attached. Run `pnpm featurebase:parity:report` to validate local UI/API surface coverage against `docs/05-FRONTEND.md`.",
      "",
    ];
  }

  const pct = (value) => (value === null || value === undefined ? "n/a" : value.toFixed(3));
  return [
    "## Featurebase Parity",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("source_doc", report.sourceDoc),
    row("score", pct(report.score)),
    row("threshold", pct(report.threshold)),
    row("passed_weight", report.passedWeight),
    row("total_weight", report.totalWeight),
    row("failures", report.failures?.length ? report.failures.join("; ") : "none"),
    "",
  ];
}

function qualityGateSection(report) {
  if (!report) {
    return [
      "## Quality Gate",
      "",
      "No quality gate report was attached. Run `pnpm test:coverage`, then `pnpm quality:gate:report`, and pass `QUALITY_GATE_REPORT_JSON=artifacts/release/quality-gate.json` to embed P1-ACC-06 evidence.",
      "",
    ];
  }

  const pct = (value) => (value === null || value === undefined ? "n/a" : `${value.toFixed(2)}%`);
  const rate = (value) => (value === null || value === undefined ? "n/a" : value.toFixed(3));
  return [
    "## Quality Gate",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("coverage_source", report.coverage?.source),
    row("coverage_threshold", `${report.coverage?.thresholds?.minPct}%`),
    row("lines", pct(report.coverage?.lines?.pct)),
    row("statements", pct(report.coverage?.statements?.pct)),
    row("functions", pct(report.coverage?.functions?.pct)),
    row("branches_informational", pct(report.coverage?.branches?.pct)),
    row("ci_green_rate_threshold", rate(report.ciHistory?.thresholds?.greenRateMin)),
    row("ci_green_rate", rate(report.ciHistory?.greenRate)),
    row(
      "external_required",
      report.externalRequired?.length ? report.externalRequired.join("; ") : "none",
    ),
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
const dockerLiteStartupReport = loadDockerLiteStartupReport();
const copilotAdoptionReport = loadCopilotAdoptionReport();
const supportFlowReport = loadSupportFlowReport();
const customerReachabilityReport = loadCustomerReachabilityReport();
const widgetRuntimeReport = loadWidgetRuntimeReport();
const autoResolutionReport = loadAutoResolutionReport();
const featurebaseParityReport = loadFeaturebaseParityReport();
const qualityGateReport = loadQualityGateReport();
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
  "| Quality gate report | `pnpm quality:gate:report` | CI job uploads JSON/Markdown; remote green-rate history required before tag |",
  "| KB eval | `pnpm kb:eval` | CI job must pass |",
  "| Local KB P95 | `pnpm kb:bench:local` | CI job must pass |",
  "| API KB P95 | `pnpm kb:bench:api:local` | CI job must pass and upload `kb-api-bench.md` |",
  "| Typecheck | `pnpm typecheck` | CI job must pass |",
  "| API binary | `pnpm verify:api-binary` | CI job must pass |",
  "| Alpha acceptance | `pnpm alpha:acceptance` | CI job must pass |",
  "| Widget runtime | `pnpm widget:runtime:report` | CI job uploads JSON/Markdown embed evidence |",
  "",
  ...supportFlowSection(supportFlowReport),
  ...customerReachabilitySection(customerReachabilityReport),
  ...widgetRuntimeSection(widgetRuntimeReport),
  ...autoResolutionSection(autoResolutionReport),
  ...featurebaseParitySection(featurebaseParityReport),
  ...qualityGateSection(qualityGateReport),
  ...copilotAdoptionSection(copilotAdoptionReport),
  ...dockerLiteStartupSection(dockerLiteStartupReport),
  ...ollamaOfflineSection(ollamaOfflineReport),
  ...kbEvalSection(kbEvalReport),
  ...telemetrySection(telemetryReport),
  "## Gates Requiring External Artifacts",
  "",
  "- API-level `pnpm kb:bench` P95 from the deployed service.",
  "- CI run history proving green rate >= 95%.",
  "- Production/prod-like Copilot adoption report with `evidenceStatus: pass` and accept rate >= 30%.",
  "- Actual Docker lite startup timing report with `evidenceStatus: pass` from a Docker-enabled release environment.",
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
