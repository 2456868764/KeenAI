import type { KeenaiDb } from "@keenai/storage";
import { kbQueryLogs } from "@keenai/storage/schema";
import { and, eq, gte } from "drizzle-orm";
import type { KbGoldenEvalReport } from "./run-golden.js";

export type KbEvalMetrics = {
  totalQueries: number;
  helpfulRate: number;
  notHelpfulRate: number;
  graphContributionRate: number;
  recallAt5: number | null;
  precisionAt5: number | null;
};

export type ComputeKbEvalMetricsInput = {
  orgId: string;
  brandId: string;
  since?: Date;
};

/** Merge golden retrieval eval into lifecycle metrics (KB-23). */
export function enrichKbEvalMetricsFromGolden(
  metrics: KbEvalMetrics,
  golden: KbGoldenEvalReport,
): KbEvalMetrics {
  if (golden.caseCount === 0) return metrics;
  return {
    ...metrics,
    recallAt5: golden.recallAt5,
    precisionAt5: golden.hitRate,
    graphContributionRate: golden.graphContributionRate,
  };
}

/** KB-23 lifecycle metrics from query logs (+ optional golden merge). */
export async function computeKbEvalMetrics(
  db: KeenaiDb,
  input: ComputeKbEvalMetricsInput,
): Promise<KbEvalMetrics> {
  const filters = [eq(kbQueryLogs.orgId, input.orgId), eq(kbQueryLogs.brandId, input.brandId)];
  if (input.since) filters.push(gte(kbQueryLogs.createdAt, input.since));

  const rows = await db
    .select({
      userFeedback: kbQueryLogs.userFeedback,
      retrievedChunkIds: kbQueryLogs.retrievedChunkIds,
    })
    .from(kbQueryLogs)
    .where(and(...filters));

  const total = rows.length;
  const helpful = rows.filter((row) => row.userFeedback === "helpful").length;
  const notHelpful = rows.filter((row) => row.userFeedback === "not_helpful").length;
  const withFeedback = helpful + notHelpful;

  return {
    totalQueries: total,
    helpfulRate: withFeedback > 0 ? helpful / withFeedback : 0,
    notHelpfulRate: withFeedback > 0 ? notHelpful / withFeedback : 0,
    graphContributionRate: 0,
    recallAt5: null,
    precisionAt5: null,
  };
}
