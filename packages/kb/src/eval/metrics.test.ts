import { describe, expect, it } from "vitest";
import { enrichKbEvalMetricsFromGolden } from "./metrics.js";
import type { KbGoldenEvalReport } from "./run-golden.js";

describe("enrichKbEvalMetricsFromGolden", () => {
  const base = {
    totalQueries: 10,
    helpfulRate: 0.8,
    notHelpfulRate: 0.2,
    graphContributionRate: 0,
    recallAt5: null,
    precisionAt5: null,
  };

  it("leaves metrics unchanged when golden has no cases", () => {
    const golden = {
      caseCount: 0,
      recallAt5: 0.9,
      recallAt10: 0.9,
      mrr: 0.5,
      hitRate: 0.8,
      graphContributionRate: 0.3,
      avgFaithfulness: null,
      avgAnswerRelevance: null,
      avgContextualRecall: null,
      cases: [],
      thresholds: {
        recallAt5Min: 0.92,
        hitRateMin: 0.9,
        mrrMin: 0.8,
        faithfulnessMin: 0.85,
        contextualRecallMin: 0.75,
      },
      passed: false,
      failures: [],
    } satisfies KbGoldenEvalReport;

    expect(enrichKbEvalMetricsFromGolden(base, golden)).toEqual(base);
  });

  it("merges recall, precision, and graph contribution from golden report", () => {
    const golden = {
      caseCount: 2,
      recallAt5: 0.95,
      recallAt10: 0.97,
      mrr: 0.88,
      hitRate: 0.9,
      graphContributionRate: 0.25,
      avgFaithfulness: null,
      avgAnswerRelevance: null,
      avgContextualRecall: null,
      cases: [],
      thresholds: {
        recallAt5Min: 0.92,
        hitRateMin: 0.9,
        mrrMin: 0.8,
        faithfulnessMin: 0.85,
        contextualRecallMin: 0.75,
      },
      passed: true,
      failures: [],
    } satisfies KbGoldenEvalReport;

    expect(enrichKbEvalMetricsFromGolden(base, golden)).toEqual({
      ...base,
      recallAt5: 0.95,
      precisionAt5: 0.9,
      graphContributionRate: 0.25,
    });
  });
});
