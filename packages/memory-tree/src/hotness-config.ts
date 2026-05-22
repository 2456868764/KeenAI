import type { MemoryHotnessSignals } from "@keenai/storage/schema";

export type HotnessWeights = {
  messageCount7d: number;
  openTicketCount: number;
  negativeCsatWeight: number;
  agentPinBoost: number;
};

export const DEFAULT_HOTNESS_WEIGHTS: HotnessWeights = {
  messageCount7d: 1,
  openTicketCount: 2,
  negativeCsatWeight: 3,
  agentPinBoost: 5,
};

/** Minimum hotness score before materializing topic tree buffers. */
export const DEFAULT_HOTNESS_THRESHOLD = 2;

export function computeHotnessScore(
  signals: MemoryHotnessSignals,
  weights: HotnessWeights = DEFAULT_HOTNESS_WEIGHTS,
): number {
  return (
    weights.messageCount7d * signals.messageCount7d +
    weights.openTicketCount * signals.openTicketCount +
    weights.negativeCsatWeight * signals.negativeCsatWeight +
    weights.agentPinBoost * signals.agentPinBoost
  );
}

export function isHotEnough(score: number, threshold: number = DEFAULT_HOTNESS_THRESHOLD): boolean {
  return score >= threshold;
}
