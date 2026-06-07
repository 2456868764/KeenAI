import { describe, expect, it } from "vitest";
import { csatBlockSchema } from "./csat.js";

describe("csatBlockSchema", () => {
  it("accepts waitForRating csat block", () => {
    const parsed = csatBlockSchema.parse({
      id: "csat-1",
      type: "csat",
      prompt: "Rate us",
      waitForRating: true,
      waitForRatingMinutes: 1440,
    });
    expect(parsed.waitForRating).toBe(true);
  });
});
