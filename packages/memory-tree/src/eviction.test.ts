import { describe, expect, it } from "vitest";
import { evictionScore } from "./eviction.js";

describe("evictionScore", () => {
  it("ranks high-confidence recent facts above stale low-importance facts", () => {
    const strong = evictionScore({
      confidence: 0.9,
      accessFrequency: 0.8,
      recencyScore: 0.9,
      importanceScore: 0.8,
    });
    const weak = evictionScore({
      confidence: 0.2,
      accessFrequency: 0.1,
      recencyScore: 0.1,
      importanceScore: 0.2,
    });

    expect(strong).toBeGreaterThan(weak);
  });
});
