/** Heuristic answer/context scorers (Sprint 18 stub · Mastra/DeepEval hook later). */

export const KEENI_KB_SPRINT18_EVAL = {
  enabled: true,
  target: "kb.eval.answer-scorer",
  notes: "Stub lexical scorers; swap for @mastra/evals when judge model is configured.",
} as const;

export type KbAnswerQualityScores = {
  faithfulness: number;
  answerRelevance: number;
  contextualRecall: number;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/** Lexical overlap between answer and retrieved context (faithfulness proxy). */
export function scoreKbFaithfulness(answer: string, contextChunks: string[]): number {
  const answerTokens = tokenize(answer);
  const contextTokens = tokenize(contextChunks.join("\n"));
  return jaccard(answerTokens, contextTokens);
}

/** Overlap between answer and user query (relevance proxy). */
export function scoreKbAnswerRelevance(answer: string, query: string): number {
  return jaccard(tokenize(answer), tokenize(query));
}

/** Fraction of expected answer tokens present in context (contextual recall proxy). */
export function scoreKbContextualRecall(expectedAnswer: string, contextChunks: string[]): number {
  const expected = tokenize(expectedAnswer);
  const context = tokenize(contextChunks.join("\n"));
  if (expected.size === 0) return 1;
  let covered = 0;
  for (const token of expected) {
    if (context.has(token)) covered++;
  }
  return covered / expected.size;
}

export function scoreKbAnswerQuality(input: {
  query: string;
  answer: string;
  contextChunks: string[];
  expectedAnswer?: string | null;
}): KbAnswerQualityScores {
  const contextualRecall = input.expectedAnswer
    ? scoreKbContextualRecall(input.expectedAnswer, input.contextChunks)
    : scoreKbFaithfulness(input.answer, input.contextChunks);

  return {
    faithfulness: scoreKbFaithfulness(input.answer, input.contextChunks),
    answerRelevance: scoreKbAnswerRelevance(input.answer, input.query),
    contextualRecall,
  };
}
