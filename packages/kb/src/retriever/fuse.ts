import type { KbSourceType } from "@keenai/storage/schema";
import { getKbFreshnessHalfLifeDays } from "../lifecycle/freshness.js";

export const KEENI_KB_KB11 = {
  enabled: true,
  target: "kb.search.post_fuse",
  notes: "KB-11 stub: recency half-life 90d then diversify maxPerSource=2 maxPerSection=1.",
} as const;

export const KB_RECENCY_HALF_LIFE_DAYS = 90;
export const KB_RECENCY_SCORE_FLOOR = 0.7;
export const KB_RECENCY_SCORE_CEILING = 0.3;
export const KB_DIVERSIFY_MAX_PER_SOURCE = 2;
export const KB_DIVERSIFY_MAX_PER_SECTION = 1;

const MS_PER_DAY = 86_400_000;

export type KbRecencyTimestamp = Date | number | null | undefined;

export type KbDiversifiableHit = {
  chunkId: string;
  sourceId: string;
  sectionId: string | null;
  documentId: string;
};

export type KbRecencyScorableHit = {
  fusedScore: number;
  rerankScore?: number;
};

export type KbRecencyHit = KbRecencyScorableHit & {
  sourceType?: KbSourceType;
  sourceUpdatedAt?: KbRecencyTimestamp;
  updatedAt?: KbRecencyTimestamp;
  indexedAt?: KbRecencyTimestamp;
  confidence?: number;
};

export type KbRecencyAppliedFields = {
  recencyBoost: number;
};

export type ApplyKbRecencyOptions = {
  /** When set, overrides per-source KB-15 rules. */
  halfLifeDays?: number | null;
  nowMs?: number;
};

export type DiversifyKbHitsOptions = {
  maxPerSource?: number;
  maxPerSection?: number;
};

export type ApplyKbSearchPostFuseOptions = {
  recency?: boolean;
  diversify?: boolean;
  confidence?: boolean;
  halfLifeDays?: number | null;
  maxPerSource?: number;
  maxPerSection?: number;
  nowMs?: number;
};

/** KB-13: multiply ranking score by stored chunk confidence. */
export function applyKbChunkConfidence<T extends KbRecencyScorableHit & { confidence?: number }>(
  hit: T,
): T {
  const weight = hit.confidence ?? 1;
  const baseScore = kbHitRankingScore(hit);
  const adjusted = baseScore * weight;
  if (hit.rerankScore != null) {
    return { ...hit, rerankScore: adjusted };
  }
  return { ...hit, fusedScore: adjusted };
}

/** Exponential decay boost in (0, 1]; missing timestamp → 1. */
export function kbRecencyBoost(
  timestamp: KbRecencyTimestamp,
  opts?: ApplyKbRecencyOptions,
): number {
  if (timestamp == null) return 1;

  const atMs = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  if (!Number.isFinite(atMs)) return 1;

  const nowMs = opts?.nowMs ?? Date.now();
  const halfLifeDays = opts?.halfLifeDays ?? KB_RECENCY_HALF_LIFE_DAYS;
  if (halfLifeDays == null) return 1;
  const daysAgo = Math.max(0, (nowMs - atMs) / MS_PER_DAY);
  return Math.exp((-daysAgo * Math.LN2) / halfLifeDays);
}

export function resolveKbRecencyTimestamp(hit: KbRecencyHit): KbRecencyTimestamp {
  return hit.sourceUpdatedAt ?? hit.updatedAt ?? hit.indexedAt ?? null;
}

export function kbHitRankingScore(hit: KbRecencyScorableHit): number {
  return hit.rerankScore ?? hit.fusedScore;
}

function resolveKbRecencyHalfLifeDays(
  hit: KbRecencyHit,
  opts?: ApplyKbRecencyOptions,
): number | null {
  if (opts?.halfLifeDays !== undefined) return opts.halfLifeDays;
  if (hit.sourceType) return getKbFreshnessHalfLifeDays(hit.sourceType);
  return KB_RECENCY_HALF_LIFE_DAYS;
}

/** Scale ranking score by recency: `score × (0.7 + 0.3 × boost)`. */
export function applyKbRecency<T extends KbRecencyHit>(
  hit: T,
  opts?: ApplyKbRecencyOptions,
): T & KbRecencyAppliedFields {
  const halfLifeDays = resolveKbRecencyHalfLifeDays(hit, opts);
  const recencyBoost = kbRecencyBoost(resolveKbRecencyTimestamp(hit), {
    ...opts,
    halfLifeDays,
  });
  const multiplier = KB_RECENCY_SCORE_FLOOR + KB_RECENCY_SCORE_CEILING * recencyBoost;
  const baseScore = kbHitRankingScore(hit);
  const adjusted = baseScore * multiplier;

  if (hit.rerankScore != null) {
    return { ...hit, rerankScore: adjusted, recencyBoost };
  }
  return { ...hit, fusedScore: adjusted, recencyBoost };
}

/** Greedy diversity filter preserving input order (KB-11). */
export function diversifyKbSearchHits<T extends KbDiversifiableHit>(
  hits: T[],
  opts?: DiversifyKbHitsOptions,
): T[] {
  const maxPerSource = opts?.maxPerSource ?? KB_DIVERSIFY_MAX_PER_SOURCE;
  const maxPerSection = opts?.maxPerSection ?? KB_DIVERSIFY_MAX_PER_SECTION;
  const bySource = new Map<string, number>();
  const bySection = new Map<string, number>();
  const kept: T[] = [];

  for (const hit of hits) {
    const sourceCount = bySource.get(hit.sourceId) ?? 0;
    if (sourceCount >= maxPerSource) continue;

    const sectionKey = hit.sectionId ?? `doc:${hit.documentId}`;
    const sectionCount = bySection.get(sectionKey) ?? 0;
    if (sectionCount >= maxPerSection) continue;

    bySource.set(hit.sourceId, sourceCount + 1);
    bySection.set(sectionKey, sectionCount + 1);
    kept.push(hit);
  }

  return kept;
}

export function sortKbSearchHitsByRankingScore<T extends KbRecencyScorableHit>(hits: T[]): T[] {
  return [...hits].sort((a, b) => kbHitRankingScore(b) - kbHitRankingScore(a));
}

/** KB-11 post-processing after hydrate: recency rescoring → resort → diversify. */
export function applyKbSearchPostFuse<T extends KbDiversifiableHit & KbRecencyHit>(
  hits: T[],
  opts?: ApplyKbSearchPostFuseOptions,
): T[] {
  let processed: T[] = hits;

  if (opts?.recency !== false) {
    processed = sortKbSearchHitsByRankingScore(
      processed.map((hit) =>
        applyKbRecency(hit, { halfLifeDays: opts?.halfLifeDays, nowMs: opts?.nowMs }),
      ),
    );
  }

  if (opts?.confidence !== false) {
    processed = sortKbSearchHitsByRankingScore(processed.map((hit) => applyKbChunkConfidence(hit)));
  }

  if (opts?.diversify !== false) {
    processed = diversifyKbSearchHits(processed, {
      maxPerSource: opts?.maxPerSource,
      maxPerSection: opts?.maxPerSection,
    });
  }

  return processed;
}
