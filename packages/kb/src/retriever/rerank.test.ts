import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClassify = vi.fn(async () => [{ label: "LABEL_1", score: 0.91 }]);
const mockPipeline = vi.fn(async () => mockClassify);

vi.mock("@xenova/transformers", () => ({
  pipeline: mockPipeline,
}));

import {
  BGE_RERANKER_MODEL_ID,
  KB_RERANK_OUTPUT_TOP_K,
  KB_RERANK_RRF_TOP_K,
  applyKbRerank,
  createKbReranker,
  createStubKbReranker,
  createXenovaBgeReranker,
  resetXenovaRerankerCacheForTests,
} from "./rerank.js";

describe("KB-08 reranker", () => {
  beforeEach(() => {
    resetXenovaRerankerCacheForTests();
    mockClassify.mockClear();
    mockPipeline.mockClear();
  });

  afterEach(() => {
    resetXenovaRerankerCacheForTests();
  });

  it("stub reranker prefers lexical overlap", async () => {
    const reranker = createStubKbReranker();
    const scored = await reranker.rerank("billing invoice", [
      { id: "a", text: "unrelated product tour" },
      { id: "b", text: "billing invoice for enterprise plan" },
    ]);
    expect(scored[0]?.id).toBe("b");
    expect(scored[0]?.score).toBeGreaterThan(scored[1]?.score ?? 0);
  });

  it("applyKbRerank caps RRF pool and output top-K", async () => {
    const hits = Array.from({ length: 50 }, (_, index) => ({
      chunkId: `c${index}`,
      content: `chunk ${index}`,
      contextPrefix: null,
    }));

    const reranked = await applyKbRerank("billing", hits, createStubKbReranker(), {
      rrfTopK: 5,
      rerankTopK: 2,
    });
    expect(reranked).toHaveLength(2);
    expect(reranked[0]?.rerankScore).toBeDefined();
  });

  it("exposes xenova reranker metadata and pipeline", async () => {
    const reranker = createXenovaBgeReranker();
    expect(reranker.model).toBe(BGE_RERANKER_MODEL_ID);

    await reranker.rerank("refund policy", [{ id: "x", text: "refund policy details" }]);
    expect(mockPipeline).toHaveBeenCalledWith("text-classification", BGE_RERANKER_MODEL_ID, {
      quantized: true,
    });
  });

  it("exports default RRF and rerank top-K constants", () => {
    expect(KB_RERANK_RRF_TOP_K).toBe(40);
    expect(KB_RERANK_OUTPUT_TOP_K).toBe(15);
    expect(createKbReranker("stub").model).toBe("stub/lexical-v1");
  });
});
