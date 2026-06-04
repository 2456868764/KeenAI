import { describe, expect, it } from "vitest";
import { hitAtK, recallAtK, reciprocalRank } from "./recall.js";

describe("KB eval recall metrics", () => {
  it("computes recall, hit, and MRR", () => {
    const expected = ["a", "b"];
    const retrieved = ["x", "a", "c", "b"];
    expect(recallAtK(expected, retrieved, 5)).toBe(1);
    expect(hitAtK(expected, retrieved, 2)).toBe(true);
    expect(reciprocalRank(expected, retrieved)).toBe(0.5);
  });
});
