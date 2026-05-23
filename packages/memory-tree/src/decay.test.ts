import { describe, expect, it } from "vitest";
import { computeDecayedFactScore, memoryStrength } from "./decay.js";
import { evictionScore } from "./eviction.js";

describe("memoryStrength", () => {
  it("halves confidence after one half-life", () => {
    expect(memoryStrength(1, 14)).toBeCloseTo(0.5, 5);
  });

  it("returns initial confidence at zero elapsed days", () => {
    expect(memoryStrength(0.8, 0)).toBeCloseTo(0.8, 5);
  });
});

describe("computeDecayedFactScore", () => {
  it("archives facts that decay below the minimum confidence", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    const result = computeDecayedFactScore(
      {
        confidence: 0.2,
        importance: 0.5,
        accessCount: 0,
        lastAccessAt: null,
        updatedAt,
        now,
        minConfidence: 0.05,
      },
      evictionScore,
    );

    expect(result.shouldArchive).toBe(true);
    expect(result.confidence).toBeLessThan(0.05);
  });

  it("computes eviction score for active facts", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const result = computeDecayedFactScore(
      {
        confidence: 0.9,
        importance: 0.8,
        accessCount: 5,
        lastAccessAt: new Date("2026-05-30T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        now,
      },
      evictionScore,
    );

    expect(result.shouldArchive).toBe(false);
    expect(result.evictionScore).toBeGreaterThan(0.5);
  });
});
