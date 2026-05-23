/** Default half-life for Ebbinghaus-style confidence decay (days). */
export const DEFAULT_MEMORY_HALF_LIFE_DAYS = 14;

/** Facts below this confidence after decay are soft-archived. */
export const DEFAULT_MIN_CONFIDENCE = 0.05;

const MS_PER_DAY = 86_400_000;

/** Compute decayed memory strength from initial confidence and days since last access. */
export function memoryStrength(
  initialConfidence: number,
  daysSinceLastAccess: number,
  halfLifeDays = DEFAULT_MEMORY_HALF_LIFE_DAYS,
): number {
  if (halfLifeDays <= 0) return initialConfidence;
  const decay = Math.exp((-daysSinceLastAccess * Math.LN2) / halfLifeDays);
  return initialConfidence * decay;
}

export function daysSince(reference: Date, now: Date): number {
  return Math.max(0, (now.getTime() - reference.getTime()) / MS_PER_DAY);
}

export type DecayedFactScore = {
  confidence: number;
  evictionScore: number;
  shouldArchive: boolean;
};

export type ComputeDecayedFactInput = {
  confidence: number;
  importance: number;
  accessCount: number;
  lastAccessAt: Date | null;
  updatedAt: Date;
  now: Date;
  halfLifeDays?: number;
  minConfidence?: number;
};

/** Apply decay and derive whether a fact should be archived. */
export function computeDecayedFactScore(
  input: ComputeDecayedFactInput,
  computeEviction: (values: {
    confidence: number;
    accessFrequency: number;
    recencyScore: number;
    importanceScore: number;
  }) => number,
): DecayedFactScore {
  const reference = input.lastAccessAt ?? input.updatedAt;
  const elapsedDays = daysSince(reference, input.now);
  const confidence = memoryStrength(
    input.confidence,
    elapsedDays,
    input.halfLifeDays ?? DEFAULT_MEMORY_HALF_LIFE_DAYS,
  );
  const accessFrequency = Math.min(1, input.accessCount / 10);
  const recencyScore = Math.exp(-elapsedDays / 30);
  const importanceScore = Math.min(1, Math.max(0, input.importance));
  const evictionScore = computeEviction({
    confidence,
    accessFrequency,
    recencyScore,
    importanceScore,
  });
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  return {
    confidence,
    evictionScore,
    shouldArchive: confidence < minConfidence,
  };
}
