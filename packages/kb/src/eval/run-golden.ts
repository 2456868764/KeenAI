import type { KeenaiDb } from "@keenai/storage";
import { type SearchKbChunksInput, searchKbChunks } from "../search-kb-chunks.js";
import { type KbAnswerQualityScores, scoreKbAnswerQuality } from "./answer-scorer.js";
import { listKbGoldenQueries } from "./golden.js";
import { type KbEvalConfig, checkKbEvalThresholds, loadKbEvalConfig } from "./kb-eval-config.js";
import {
  averageRecallAtK,
  hitAtK,
  hitRate,
  meanReciprocalRank,
  recallAtK,
  reciprocalRank,
} from "./recall.js";

export type ListKbGoldenQueriesInput = {
  orgId: string;
  brandId: string;
  limit?: number;
};

export type KbGoldenEvalCaseResult = {
  goldenQueryId: string;
  query: string;
  expectedChunkIds: string[];
  retrievedChunkIds: string[];
  recallAt5: number;
  hitAt5: boolean;
  reciprocalRank: number;
  graphHit: boolean;
  answerScores: KbAnswerQualityScores | null;
};

export type KbGoldenEvalReport = {
  caseCount: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  hitRate: number;
  graphContributionRate: number;
  avgFaithfulness: number | null;
  avgAnswerRelevance: number | null;
  avgContextualRecall: number | null;
  cases: KbGoldenEvalCaseResult[];
  thresholds: KbEvalConfig["thresholds"];
  passed: boolean;
  failures: string[];
};

export type RunKbGoldenEvalInput = {
  orgId: string;
  brandId: string;
  k?: number;
  maxCases?: number;
  config?: KbEvalConfig;
  search: Omit<SearchKbChunksInput, "orgId" | "brandId" | "q">;
};

/** Run retrieval eval against `kb_golden_queries` (Sprint 18 nightly suite). */
export async function runKbGoldenEval(
  db: KeenaiDb,
  input: RunKbGoldenEvalInput,
): Promise<KbGoldenEvalReport> {
  const config = input.config ?? loadKbEvalConfig();
  const k = input.k ?? 5;
  const maxCases = input.maxCases ?? config.nightlyMaxCases;

  const golden = await listKbGoldenQueries(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    limit: maxCases,
  });

  const cases: KbGoldenEvalCaseResult[] = [];
  const recallRows: Array<{ expectedIds: string[]; retrievedIds: string[] }> = [];
  const faithfulness: number[] = [];
  const answerRelevance: number[] = [];
  const contextualRecall: number[] = [];
  let graphHits = 0;

  for (const row of golden) {
    const expectedChunkIds = row.expectedChunkIds ?? [];
    const { hits } = await searchKbChunks(db, {
      ...input.search,
      orgId: input.orgId,
      brandId: input.brandId,
      q: row.query,
      limit: Math.max(k, 10),
    });

    const retrievedChunkIds = hits.map((hit) => hit.chunkId);
    const graphHit = hits.some((hit) => hit.sources.includes("graph"));
    if (graphHit) graphHits++;

    let answerScores: KbAnswerQualityScores | null = null;
    if (row.expectedAnswer) {
      const contextChunks = hits.map((hit) => hit.content);
      answerScores = scoreKbAnswerQuality({
        query: row.query,
        answer: row.expectedAnswer,
        contextChunks,
        expectedAnswer: row.expectedAnswer,
      });
      faithfulness.push(answerScores.faithfulness);
      answerRelevance.push(answerScores.answerRelevance);
      contextualRecall.push(answerScores.contextualRecall);
    }

    cases.push({
      goldenQueryId: row.id,
      query: row.query,
      expectedChunkIds,
      retrievedChunkIds,
      recallAt5: recallAtK(expectedChunkIds, retrievedChunkIds, 5),
      hitAt5: hitAtK(expectedChunkIds, retrievedChunkIds, 5),
      reciprocalRank: reciprocalRank(expectedChunkIds, retrievedChunkIds),
      graphHit,
      answerScores,
    });

    recallRows.push({ expectedIds: expectedChunkIds, retrievedIds: retrievedChunkIds });
  }

  const caseCount = cases.length;
  const recallAt5 = averageRecallAtK(recallRows, 5);
  const recallAt10 = averageRecallAtK(recallRows, 10);
  const mrr = meanReciprocalRank(recallRows);
  const hitRateValue = hitRate(recallRows, 5);
  const graphContributionRate = caseCount > 0 ? graphHits / caseCount : 0;

  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

  const avgFaithfulness = avg(faithfulness);
  const avgAnswerRelevance = avg(answerRelevance);
  const avgContextualRecall = avg(contextualRecall);

  const thresholdCheck =
    caseCount === 0
      ? { passed: true, failures: [] as string[] }
      : checkKbEvalThresholds(
          {
            recallAt5,
            mrr,
            hitRate: hitRateValue,
            avgFaithfulness,
            avgContextualRecall,
          },
          config,
        );

  return {
    caseCount,
    recallAt5,
    recallAt10,
    mrr,
    hitRate: hitRateValue,
    graphContributionRate,
    avgFaithfulness,
    avgAnswerRelevance,
    avgContextualRecall,
    cases,
    thresholds: config.thresholds,
    passed: thresholdCheck.passed,
    failures: thresholdCheck.failures,
  };
}
