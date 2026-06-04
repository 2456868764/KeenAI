import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPipe = vi.fn(async () => ({ data: new Float32Array(1024) }));
const mockPipeline = vi.fn(async () => mockPipe);

vi.mock("@xenova/transformers", () => ({
  pipeline: mockPipeline,
}));

import {
  BGE_M3_DIMENSIONS,
  BGE_M3_MODEL_ID,
  createKbChunkEmbedder,
  createStubKbChunkEmbedder,
  createXenovaBgeM3KbEmbedder,
  embedKbChunk,
  resetXenovaPipelineCacheForTests,
} from "./embedder.js";

describe("KB-07 embedder", () => {
  beforeEach(() => {
    resetXenovaPipelineCacheForTests();
    mockPipe.mockClear();
    mockPipeline.mockClear();
  });

  afterEach(() => {
    resetXenovaPipelineCacheForTests();
  });

  it("uses stub embedder by default", async () => {
    const result = await embedKbChunk("hello keenai kb", createKbChunkEmbedder("stub"));
    expect(result.dimensions).toBe(8);
    expect(result.embedding).toHaveLength(8);
  });

  it("exposes bge-m3 metadata for xenova embedder", () => {
    const embedder = createXenovaBgeM3KbEmbedder();
    expect(embedder.model).toBe(BGE_M3_MODEL_ID);
    expect(embedder.dimensions).toBe(BGE_M3_DIMENSIONS);
  });

  it("embeds with xenova pipeline at 1024 dimensions", async () => {
    const result = await embedKbChunk("billing policy", createXenovaBgeM3KbEmbedder());
    expect(result.model).toBe(BGE_M3_MODEL_ID);
    expect(result.dimensions).toBe(1024);
    expect(result.embedding).toHaveLength(1024);
    expect(mockPipeline).toHaveBeenCalledWith("feature-extraction", BGE_M3_MODEL_ID, {
      quantized: true,
    });
  });

  it("stub chunk embedder matches createStubKbChunkEmbedder", async () => {
    const a = await embedKbChunk("same text", createStubKbChunkEmbedder());
    const b = await embedKbChunk("same text", createKbChunkEmbedder("stub"));
    expect(a).toEqual(b);
  });
});
