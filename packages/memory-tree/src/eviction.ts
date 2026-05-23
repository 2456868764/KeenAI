export type EvictionScoreInput = {
  confidence: number;
  accessFrequency: number;
  recencyScore: number;
  importanceScore: number;
};

/** Weighted score for importance-based eviction (higher = keep). */
export function evictionScore(input: EvictionScoreInput): number {
  return (
    input.confidence * 0.3 +
    input.accessFrequency * 0.3 +
    input.recencyScore * 0.2 +
    input.importanceScore * 0.2
  );
}

/** Default per-scope fact cap before eviction runs. */
export const DEFAULT_MAX_FACTS_PER_SCOPE = 100;
