import type { KbSourceType } from "@keenai/storage/schema";
import { type KbRecencyTimestamp, kbRecencyBoost } from "../retriever/fuse.js";
import type { KbChunkProvenance } from "./provenance.js";

/** Per-source authority weights (KB-13). */
export const KB_SOURCE_AUTHORITY: Record<KbSourceType, number> = {
  help_center: 0.95,
  file: 0.9,
  notion: 0.9,
  github: 0.85,
  web: 0.75,
  resolved_conversations: 0.7,
};

export const KB_CONFIDENCE_MIN = 0.05;
export const KB_CONFIDENCE_MAX = 1;

export type ComputeKbChunkConfidenceInput = {
  sourceType: KbSourceType;
  sourceUpdatedAt?: KbRecencyTimestamp;
  provenance?: KbChunkProvenance | null;
  nowMs?: number;
  /** null = no time decay (KB-15 help_center). */
  halfLifeDays?: number | null;
};

export function resolveKbSourceAuthority(sourceType: KbSourceType): number {
  return KB_SOURCE_AUTHORITY[sourceType] ?? 0.8;
}

export function resolveKbFeedbackScore(provenance?: KbChunkProvenance | null): number {
  const score = provenance?.feedbackScore;
  if (score == null || !Number.isFinite(score)) return 1;
  return Math.min(KB_CONFIDENCE_MAX, Math.max(KB_CONFIDENCE_MIN, score));
}

export function clampKbConfidence(value: number): number {
  return Math.min(KB_CONFIDENCE_MAX, Math.max(KB_CONFIDENCE_MIN, value));
}

/** KB-13: evidence-based confidence (non-default 1.0 for most sources). */
export function computeKbChunkConfidence(input: ComputeKbChunkConfidenceInput): number {
  const authority = resolveKbSourceAuthority(input.sourceType);
  const recency =
    input.halfLifeDays === null
      ? 1
      : kbRecencyBoost(input.sourceUpdatedAt, {
          nowMs: input.nowMs,
          halfLifeDays: input.halfLifeDays,
        });
  const feedback = resolveKbFeedbackScore(input.provenance);
  return clampKbConfidence(authority * recency * feedback);
}
