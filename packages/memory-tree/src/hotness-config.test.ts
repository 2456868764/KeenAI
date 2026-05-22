import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOTNESS_THRESHOLD,
  DEFAULT_HOTNESS_WEIGHTS,
  computeHotnessScore,
  isHotEnough,
} from "./hotness-config.js";

describe("hotness-config", () => {
  it("computes weighted score and threshold gate", () => {
    const score = computeHotnessScore(
      {
        messageCount7d: 2,
        openTicketCount: 1,
        negativeCsatWeight: 0,
        agentPinBoost: 0,
      },
      DEFAULT_HOTNESS_WEIGHTS,
    );
    expect(score).toBe(4);
    expect(isHotEnough(score, DEFAULT_HOTNESS_THRESHOLD)).toBe(true);
    expect(isHotEnough(1, DEFAULT_HOTNESS_THRESHOLD)).toBe(false);
  });
});
