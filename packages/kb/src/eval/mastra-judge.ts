import { type KbAnswerQualityScores, scoreKbAnswerQuality } from "./answer-scorer.js";

export const KEENI_KB_I102 = {
  enabled: true,
  target: "kb.eval.mastra-judge",
  notes: "Optional @mastra/evals prebuilt scorers when KEENAI_EVAL_JUDGE_MODEL is set.",
} as const;

export type KbAnswerScoreSource = "mastra" | "lexical";

export type KbAnswerQualityResult = KbAnswerQualityScores & {
  source: KbAnswerScoreSource;
};

export type ScoreKbAnswerWithJudgeInput = {
  query: string;
  answer: string;
  contextChunks: string[];
  expectedAnswer?: string | null;
};

function normalizeScore(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  const raw = row.score ?? row.value;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1 ? raw / 100 : raw;
  }
  return null;
}

type MastraFaithfulnessScorer = {
  score?: (input: { answer: string; context: string[] }) => Promise<unknown>;
};

async function tryMastraFaithfulness(
  model: string,
  input: { answer: string; context: string[] },
): Promise<number | null> {
  const mod = (await import("@mastra/evals/scorers/prebuilt")) as Record<string, unknown>;
  const factory = mod.createFaithfulnessScorer;
  if (typeof factory !== "function") return null;

  const scorer = (factory as (opts: { model: string }) => MastraFaithfulnessScorer)({ model });
  if (typeof scorer?.score !== "function") return null;

  const raw = await scorer.score(input);
  return normalizeScore(raw);
}

/** Score answer quality; uses Mastra judge when model env/config is set. */
export async function scoreKbAnswerQualityWithJudge(
  input: ScoreKbAnswerWithJudgeInput,
  options?: { judgeModel?: string | null },
): Promise<KbAnswerQualityResult> {
  const model = options?.judgeModel ?? process.env.KEENAI_EVAL_JUDGE_MODEL ?? null;

  if (!model) {
    return { ...scoreKbAnswerQuality(input), source: "lexical" };
  }

  try {
    const faithfulness = await tryMastraFaithfulness(model, {
      answer: input.answer,
      context: input.contextChunks.filter(Boolean),
    });

    const lexical = scoreKbAnswerQuality(input);
    if (faithfulness === null) {
      return { ...lexical, source: "lexical" };
    }

    return {
      faithfulness,
      answerRelevance: lexical.answerRelevance,
      contextualRecall: input.expectedAnswer ? faithfulness : lexical.contextualRecall,
      source: "mastra",
    };
  } catch {
    return { ...scoreKbAnswerQuality(input), source: "lexical" };
  }
}
