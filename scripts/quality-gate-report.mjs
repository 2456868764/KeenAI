import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const COVERAGE_THRESHOLD = Number(process.env.QUALITY_COVERAGE_THRESHOLD ?? 70);
const CI_GREEN_RATE_THRESHOLD = Number(process.env.QUALITY_CI_GREEN_RATE_THRESHOLD ?? 0.95);

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function pctMetric(metric) {
  return {
    total: metric?.total ?? 0,
    covered: metric?.covered ?? 0,
    skipped: metric?.skipped ?? 0,
    pct: Number(metric?.pct ?? 0),
  };
}

function evaluateCoverage() {
  const source =
    process.env.QUALITY_COVERAGE_SUMMARY_JSON ?? join(ROOT, "coverage/coverage-summary.json");
  if (!existsSync(source)) {
    return {
      source,
      attached: false,
      status: "missing",
      thresholds: {
        minPct: COVERAGE_THRESHOLD,
        requiredMetrics: ["lines", "statements", "functions"],
      },
      failures: [`coverage summary not found: ${source}`],
    };
  }

  const summary = readJson(source);
  const total = summary.total ?? {};
  const metrics = {
    lines: pctMetric(total.lines),
    statements: pctMetric(total.statements),
    functions: pctMetric(total.functions),
    branches: pctMetric(total.branches),
  };
  const requiredMetrics = ["lines", "statements", "functions"];
  const failures = requiredMetrics
    .filter((name) => metrics[name].pct < COVERAGE_THRESHOLD)
    .map((name) => `${name} ${metrics[name].pct}% < ${COVERAGE_THRESHOLD}%`);

  return {
    source,
    attached: true,
    status: failures.length === 0 ? "pass" : "fail",
    thresholds: { minPct: COVERAGE_THRESHOLD, requiredMetrics },
    ...metrics,
    failures,
  };
}

function runStatus(run) {
  return String(run.status ?? run.conclusion ?? run.result ?? run.outcome ?? "").toLowerCase();
}

function runPassed(run) {
  return ["pass", "passed", "success", "successful", "green"].includes(runStatus(run));
}

function normalizeCiHistory(data) {
  const runs = Array.isArray(data) ? data : (data.runs ?? data.workflowRuns ?? data.checkRuns);
  if (Array.isArray(runs)) {
    return {
      totalRuns: runs.length,
      passedRuns: runs.filter(runPassed).length,
      sourceShape: "runs",
    };
  }

  const totalRuns = Number(data.totalRuns ?? data.total ?? data.count ?? 0);
  const passedRuns = Number(data.passedRuns ?? data.passed ?? data.successfulRuns ?? 0);
  const greenRate = data.greenRate === undefined ? null : Number(data.greenRate);
  return {
    totalRuns,
    passedRuns:
      greenRate !== null && totalRuns > 0 ? Math.round(greenRate * totalRuns) : passedRuns,
    greenRate,
    sourceShape: "summary",
  };
}

function evaluateCiHistory() {
  const source = process.env.QUALITY_CI_HISTORY_JSON;
  if (!source) {
    return {
      source: null,
      attached: false,
      status: "external_required",
      thresholds: { greenRateMin: CI_GREEN_RATE_THRESHOLD },
      totalRuns: null,
      passedRuns: null,
      greenRate: null,
      failures: [],
    };
  }

  if (!existsSync(source)) {
    return {
      source,
      attached: false,
      status: "missing",
      thresholds: { greenRateMin: CI_GREEN_RATE_THRESHOLD },
      totalRuns: null,
      passedRuns: null,
      greenRate: null,
      failures: [`CI history summary not found: ${source}`],
    };
  }

  const normalized = normalizeCiHistory(readJson(source));
  const greenRate =
    normalized.greenRate ??
    (normalized.totalRuns > 0 ? normalized.passedRuns / normalized.totalRuns : 0);
  const failures = [];
  if (normalized.totalRuns <= 0) failures.push("CI history has no runs");
  if (greenRate < CI_GREEN_RATE_THRESHOLD) {
    failures.push(`CI green rate ${greenRate.toFixed(3)} < ${CI_GREEN_RATE_THRESHOLD}`);
  }

  return {
    source,
    attached: true,
    status: failures.length === 0 ? "pass" : "fail",
    thresholds: { greenRateMin: CI_GREEN_RATE_THRESHOLD },
    totalRuns: normalized.totalRuns,
    passedRuns: normalized.passedRuns,
    greenRate,
    sourceShape: normalized.sourceShape,
    failures,
  };
}

function renderMarkdown(report) {
  const pct = (value) =>
    value === null || value === undefined ? "n/a" : `${Number(value).toFixed(2)}%`;
  const rate = (value) =>
    value === null || value === undefined ? "n/a" : Number(value).toFixed(3);

  return [
    "# Quality Gate Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| coverage_source | ${report.coverage.source} |`,
    `| coverage_threshold | ${report.coverage.thresholds.minPct}% |`,
    `| lines | ${pct(report.coverage.lines?.pct)} |`,
    `| statements | ${pct(report.coverage.statements?.pct)} |`,
    `| functions | ${pct(report.coverage.functions?.pct)} |`,
    `| branches_informational | ${pct(report.coverage.branches?.pct)} |`,
    `| ci_history_source | ${report.ciHistory.source ?? "external required"} |`,
    `| ci_green_rate_threshold | ${rate(report.ciHistory.thresholds.greenRateMin)} |`,
    `| ci_green_rate | ${rate(report.ciHistory.greenRate)} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## External Required",
    "",
    report.externalRequired.length > 0
      ? report.externalRequired.map((item) => `- ${item}`).join("\n")
      : "- none",
    "",
  ].join("\n");
}

const coverage = evaluateCoverage();
const ciHistory = evaluateCiHistory();
const failures = [...(coverage.failures ?? []), ...(ciHistory.failures ?? [])];
const externalRequired =
  ciHistory.status === "external_required"
    ? ["Attach GitHub Actions or CI run history proving green rate >= 95% before tagging v0.2.0."]
    : [];
const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length > 0 ? "fail" : externalRequired.length > 0 ? "partial" : "pass",
  coverage,
  ciHistory,
  failures,
  externalRequired,
};

const jsonPath = outputPath("QUALITY_GATE_REPORT_JSON_OUT", "quality-gate.json");
const markdownPath = outputPath("QUALITY_GATE_REPORT_MD", "quality-gate.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
