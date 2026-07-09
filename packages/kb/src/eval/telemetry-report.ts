import type { KeenaiDb } from "@keenai/storage";
import { kbQueryLogs } from "@keenai/storage/schema";
import { and, eq, gte, lte } from "drizzle-orm";

export const KEENI_KB_V020_TELEMETRY = {
  enabled: true,
  target: "kb.eval.production_telemetry_report",
  notes: "v0.2.0: release evidence report from kb_query_logs feedback and latency telemetry.",
} as const;

export type KbTelemetryThresholds = {
  staleAnswerRateMax: number;
  p95LatencyMsMax: number;
  minQueries: number;
  minFeedbackRate: number;
};

export type KbTelemetryFailureSample = {
  id: string;
  queryText: string;
  latencyMs: number | null;
  retrievedChunkIds: string[];
  createdAt: string;
};

export type KbTelemetryReport = {
  orgId: string;
  brandId: string | null;
  generatedAt: string;
  window: {
    since: string | null;
    until: string | null;
  };
  thresholds: KbTelemetryThresholds;
  totalQueries: number;
  helpfulCount: number;
  notHelpfulCount: number;
  withFeedback: number;
  helpfulRate: number;
  notHelpfulRate: number;
  feedbackCoverageRate: number;
  staleAnswerRate: number;
  emptyResultCount: number;
  emptyResultRate: number;
  avgRetrievedChunks: number;
  latency: {
    observedCount: number;
    avgMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    maxMs: number | null;
  };
  topNotHelpfulQueries: KbTelemetryFailureSample[];
  evidenceStatus: "passed" | "failed" | "insufficient_data";
  passed: boolean;
  failures: string[];
};

export type BuildKbTelemetryReportInput = {
  orgId: string;
  brandId?: string;
  since?: Date;
  until?: Date;
  generatedAt?: Date;
  topFailuresLimit?: number;
  thresholds?: Partial<KbTelemetryThresholds>;
};

export const DEFAULT_KB_TELEMETRY_THRESHOLDS: KbTelemetryThresholds = {
  staleAnswerRateMax: 0.02,
  p95LatencyMsMax: 500,
  minQueries: 1,
  minFeedbackRate: 0.1,
};

function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.ceil(p * sortedValues.length) - 1);
  return sortedValues[index] ?? null;
}

function mergeThresholds(thresholds?: Partial<KbTelemetryThresholds>): KbTelemetryThresholds {
  const merged = { ...DEFAULT_KB_TELEMETRY_THRESHOLDS };
  for (const [key, value] of Object.entries(thresholds ?? {})) {
    if (value !== undefined) {
      merged[key as keyof KbTelemetryThresholds] = value;
    }
  }
  return merged;
}

export function checkKbTelemetryThresholds(
  report: Pick<
    KbTelemetryReport,
    "feedbackCoverageRate" | "latency" | "staleAnswerRate" | "totalQueries"
  >,
  thresholds: KbTelemetryThresholds = DEFAULT_KB_TELEMETRY_THRESHOLDS,
): Pick<KbTelemetryReport, "evidenceStatus" | "failures" | "passed"> {
  const failures: string[] = [];
  let insufficient = false;

  if (report.totalQueries < thresholds.minQueries) {
    insufficient = true;
    failures.push(`total_queries ${report.totalQueries} < ${thresholds.minQueries}`);
  }
  if (report.feedbackCoverageRate < thresholds.minFeedbackRate) {
    insufficient = true;
    failures.push(
      `feedback_coverage ${report.feedbackCoverageRate.toFixed(3)} < ${thresholds.minFeedbackRate}`,
    );
  }
  if (report.latency.observedCount === 0) {
    insufficient = true;
    failures.push("latency_observed_count 0");
  }
  if (report.staleAnswerRate > thresholds.staleAnswerRateMax) {
    failures.push(
      `stale_answer_rate ${report.staleAnswerRate.toFixed(3)} > ${thresholds.staleAnswerRateMax}`,
    );
  }
  if (report.latency.p95Ms !== null && report.latency.p95Ms > thresholds.p95LatencyMsMax) {
    failures.push(`latency_p95_ms ${report.latency.p95Ms} > ${thresholds.p95LatencyMsMax}`);
  }

  return {
    evidenceStatus:
      failures.length === 0 ? "passed" : insufficient ? "insufficient_data" : "failed",
    passed: failures.length === 0,
    failures,
  };
}

/** Build v0.2 release evidence from persisted production or production-like KB query logs. */
export async function buildKbTelemetryReport(
  db: KeenaiDb,
  input: BuildKbTelemetryReportInput,
): Promise<KbTelemetryReport> {
  const thresholds = mergeThresholds(input.thresholds);
  const filters = [eq(kbQueryLogs.orgId, input.orgId)];
  if (input.brandId) filters.push(eq(kbQueryLogs.brandId, input.brandId));
  if (input.since) filters.push(gte(kbQueryLogs.createdAt, input.since));
  if (input.until) filters.push(lte(kbQueryLogs.createdAt, input.until));

  const rows = await db
    .select({
      id: kbQueryLogs.id,
      queryText: kbQueryLogs.queryText,
      retrievedChunkIds: kbQueryLogs.retrievedChunkIds,
      latencyMs: kbQueryLogs.latencyMs,
      userFeedback: kbQueryLogs.userFeedback,
      createdAt: kbQueryLogs.createdAt,
    })
    .from(kbQueryLogs)
    .where(and(...filters));

  const totalQueries = rows.length;
  const helpfulCount = rows.filter((row) => row.userFeedback === "helpful").length;
  const notHelpfulCount = rows.filter((row) => row.userFeedback === "not_helpful").length;
  const withFeedback = helpfulCount + notHelpfulCount;
  const emptyResultCount = rows.filter((row) => row.retrievedChunkIds.length === 0).length;
  const retrievedTotal = rows.reduce((sum, row) => sum + row.retrievedChunkIds.length, 0);
  const latencies = rows
    .map((row) => row.latencyMs)
    .filter((latency): latency is number => typeof latency === "number")
    .sort((a, b) => a - b);
  const latencyTotal = latencies.reduce((sum, latency) => sum + latency, 0);

  const baseReport = {
    orgId: input.orgId,
    brandId: input.brandId ?? null,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    window: {
      since: input.since?.toISOString() ?? null,
      until: input.until?.toISOString() ?? null,
    },
    thresholds,
    totalQueries,
    helpfulCount,
    notHelpfulCount,
    withFeedback,
    helpfulRate: round(ratio(helpfulCount, withFeedback)),
    notHelpfulRate: round(ratio(notHelpfulCount, withFeedback)),
    feedbackCoverageRate: round(ratio(withFeedback, totalQueries)),
    staleAnswerRate: round(ratio(notHelpfulCount, totalQueries)),
    emptyResultCount,
    emptyResultRate: round(ratio(emptyResultCount, totalQueries)),
    avgRetrievedChunks: round(ratio(retrievedTotal, totalQueries)),
    latency: {
      observedCount: latencies.length,
      avgMs: latencies.length > 0 ? round(latencyTotal / latencies.length) : null,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99),
      maxMs: latencies.at(-1) ?? null,
    },
    topNotHelpfulQueries: rows
      .filter((row) => row.userFeedback === "not_helpful")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.topFailuresLimit ?? 10)
      .map((row) => ({
        id: row.id,
        queryText: row.queryText,
        latencyMs: row.latencyMs ?? null,
        retrievedChunkIds: row.retrievedChunkIds,
        createdAt: row.createdAt.toISOString(),
      })),
  };

  return {
    ...baseReport,
    ...checkKbTelemetryThresholds(baseReport, thresholds),
  };
}

export function renderKbTelemetryMarkdown(report: KbTelemetryReport): string {
  const row = (label: string, value: string | number | null) => `| ${label} | ${value ?? "n/a"} |`;

  return [
    "## KB Production Telemetry",
    "",
    "| Field | Value |",
    "|-------|-------|",
    row("status", report.evidenceStatus),
    row("org_id", report.orgId),
    row("brand_id", report.brandId),
    row("window_since", report.window.since),
    row("window_until", report.window.until),
    row("total_queries", report.totalQueries),
    row("feedback_coverage", report.feedbackCoverageRate.toFixed(3)),
    row("stale_answer_rate", report.staleAnswerRate.toFixed(3)),
    row("latency_p95_ms", report.latency.p95Ms),
    row("empty_result_rate", report.emptyResultRate.toFixed(3)),
    row("failures", report.failures.length > 0 ? report.failures.join("; ") : "none"),
  ].join("\n");
}
