import type { MemoryChunkEmbedder } from "../chunk-vector-index.js";

const DEFAULT_STUB_DIMENSIONS = 384;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Deterministic bag-of-words embedder for tests and local dev (no external deps). */
export function createStubMemoryChunkEmbedder(
  dimensions = DEFAULT_STUB_DIMENSIONS,
): MemoryChunkEmbedder {
  return {
    model: `stub/bow-${dimensions}`,
    dimensions,
    async embed(text) {
      const vector = new Array<number>(dimensions).fill(0);
      for (const token of tokenize(text)) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
          hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
        }
        const idx = hash % dimensions;
        vector[idx] = (vector[idx] ?? 0) + 1;
      }
      let norm = 0;
      for (const value of vector) norm += value * value;
      norm = Math.sqrt(norm);
      if (norm === 0) return vector;
      return vector.map((value) => value / norm);
    },
  };
}
