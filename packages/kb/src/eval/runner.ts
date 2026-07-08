import type { KeenaiDb } from "@keenai/storage";
import { checkKbEvalThresholds } from "./kb-eval-config.js";
import { type KbEvalMetrics, computeKbEvalMetrics } from "./metrics.js";
import {
  type KbGoldenEvalReport,
  type RunKbGoldenEvalInput,
  runKbGoldenEval,
} from "./run-golden.js";

export type KbEvalSuiteReport = {
  lifecycle: KbEvalMetrics;
  golden: KbGoldenEvalReport;
  passed: boolean;
  failures: string[];
};

/** Sprint 18: lifecycle feedback metrics + golden retrieval eval in one run. */
export async function runKbEvalSuite(
  db: KeenaiDb,
  input: RunKbGoldenEvalInput & { since?: Date },
): Promise<KbEvalSuiteReport> {
  const [lifecycle, golden] = await Promise.all([
    computeKbEvalMetrics(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      since: input.since,
    }),
    runKbGoldenEval(db, input),
  ]);

  const enrichedLifecycle: KbEvalMetrics = {
    ...lifecycle,
    recallAt5: golden.caseCount > 0 ? golden.recallAt5 : lifecycle.recallAt5,
    precisionAt5: golden.hitRate,
    graphContributionRate: golden.graphContributionRate,
  };
  const releaseThresholdCheck = checkKbEvalThresholds(
    {
      recallAt5: enrichedLifecycle.recallAt5 ?? 0,
      mrr: golden.mrr,
      hitRate: enrichedLifecycle.precisionAt5 ?? 0,
      avgFaithfulness: golden.avgFaithfulness,
      avgContextualRecall: golden.avgContextualRecall,
      staleAnswerRate: enrichedLifecycle.staleAnswerRate,
    },
    input.config,
  );

  return {
    lifecycle: enrichedLifecycle,
    golden,
    passed: golden.passed && releaseThresholdCheck.passed,
    failures: [...new Set([...golden.failures, ...releaseThresholdCheck.failures])],
  };
}
