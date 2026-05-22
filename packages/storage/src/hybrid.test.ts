import { describe, expect, it, vi } from "vitest";
import type { FTSStore } from "./core/fts-store.js";
import type { VectorStore } from "./core/vector-store.js";
import { hybridSearch, rrfFuse } from "./hybrid.js";

describe("rrfFuse", () => {
  it("returns empty for no lists", () => {
    expect(rrfFuse([])).toEqual([]);
  });

  it("boosts ids appearing in both FTS and vector rankings", () => {
    const fts = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const vector = [{ id: "b" }, { id: "d" }, { id: "a" }];

    const fused = rrfFuse([fts, vector], { k: 60, topK: 4 });
    const topIds = fused.slice(0, 2).map((h) => h.id);
    expect(topIds).toContain("a");
    expect(topIds).toContain("b");
    const dual = fused.find((h) => h.id === "a");
    expect(dual?.sources).toContain("fts");
    expect(dual?.sources).toContain("vector");
  });

  it("applies per-stream weights", () => {
    const fts = [{ id: "only-fts" }];
    const vector = [{ id: "only-vector" }];

    const ftsHeavy = rrfFuse([fts, vector], { weights: [2, 1], topK: 2 });
    expect(ftsHeavy[0]?.id).toBe("only-fts");

    const vectorHeavy = rrfFuse([fts, vector], { weights: [1, 2], topK: 2 });
    expect(vectorHeavy[0]?.id).toBe("only-vector");
  });
});

describe("hybridSearch", () => {
  it("fuses FTS and vector results", async () => {
    const ftsStore: FTSStore = {
      index: vi.fn(),
      deleteByIds: vi.fn(),
      search: vi.fn(async () => [
        { id: "chunk_1", score: 1.2 },
        { id: "chunk_2", score: 2.1 },
      ]),
    };

    const vectorStore: VectorStore = {
      upsert: vi.fn(),
      deleteByIds: vi.fn(),
      query: vi.fn(async () => [
        { id: "chunk_2", score: 0.91 },
        { id: "chunk_3", score: 0.88 },
      ]),
    };

    const hits = await hybridSearch({
      ftsStore,
      vectorStore,
      fts: { orgId: "org_1", brandId: "brand_1", q: "billing" },
      vector: { orgId: "org_1", brandId: "brand_1", embedding: [0.1, 0.2] },
      topK: 3,
    });

    expect(hits.map((h) => h.id)).toEqual(["chunk_2", "chunk_1", "chunk_3"]);
    expect(hits[0]?.sources.sort()).toEqual(["fts", "vector"]);
  });

  it("supports FTS-only when vector store is omitted", async () => {
    const ftsStore: FTSStore = {
      index: vi.fn(),
      deleteByIds: vi.fn(),
      search: vi.fn(async () => [{ id: "chunk_9", score: 0.5 }]),
    };

    const hits = await hybridSearch({
      ftsStore,
      fts: { orgId: "org_1", q: "hello" },
    });

    expect(hits).toEqual([{ id: "chunk_9", score: 1 / 61, sources: ["fts"] }]);
  });
});
