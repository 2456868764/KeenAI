import { describe, expect, it } from "vitest";
import { computeKbChunkConfidence, resolveKbSourceAuthority } from "./confidence.js";
import { buildKbChunkProvenance } from "./provenance.js";

const NOW = new Date("2026-05-19T12:00:00.000Z").getTime();

describe("KB-13 confidence", () => {
  it("computes confidence from authority × recency × feedback", () => {
    const provenance = buildKbChunkProvenance({
      sourceId: "src1",
      sourceType: "help_center",
      documentId: "doc1",
      sourceUpdatedAt: new Date(NOW),
      feedbackScore: 0.9,
    });

    const fresh = computeKbChunkConfidence({
      sourceType: "help_center",
      sourceUpdatedAt: new Date(NOW),
      provenance,
      nowMs: NOW,
      halfLifeDays: 90,
    });
    const stale = computeKbChunkConfidence({
      sourceType: "web",
      sourceUpdatedAt: new Date(NOW - 400 * 86_400_000),
      nowMs: NOW,
      halfLifeDays: 30,
    });

    expect(fresh).toBeGreaterThan(stale);
    expect(fresh).toBeLessThanOrEqual(1);
    expect(fresh).toBeGreaterThan(0.5);
    expect(resolveKbSourceAuthority("resolved_conversations")).toBeLessThan(
      resolveKbSourceAuthority("help_center"),
    );
    expect(fresh).not.toBe(1);
  });
});
