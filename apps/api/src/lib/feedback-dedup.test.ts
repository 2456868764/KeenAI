import { describe, expect, it } from "vitest";
import { textSimilarity } from "./feedback-dedup.js";

describe("textSimilarity", () => {
  it("scores near-duplicates highly", () => {
    const score = textSimilarity(
      "Add dark mode to the dashboard",
      "Please add dark mode for dashboard UI",
    );
    expect(score).toBeGreaterThan(0.4);
  });

  it("scores unrelated text low", () => {
    const score = textSimilarity("Export invoices to CSV", "Discord webhook support");
    expect(score).toBeLessThan(0.3);
  });
});
