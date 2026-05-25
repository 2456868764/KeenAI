import { createHash } from "node:crypto";

export const KB_STUB_EMBED_MODEL = "stub/hash-v1";
export const KB_STUB_EMBED_DIMENSIONS = 8;

/** Deterministic stub embedding for local dev and tests (no LLM). */
export function stubEmbedKbChunk(content: string): number[] {
  const hash = createHash("sha256").update(content).digest();
  const vector: number[] = [];

  for (let i = 0; i < KB_STUB_EMBED_DIMENSIONS; i += 1) {
    const byte = hash[i] ?? 0;
    vector.push(Number(((byte / 255) * 2 - 1).toFixed(6)));
  }

  return vector;
}

export type KbEmbeddedChunk = {
  model: string;
  dimensions: number;
  embedding: number[];
};

export function embedKbChunkStub(content: string): KbEmbeddedChunk {
  const embedding = stubEmbedKbChunk(content);
  return {
    model: KB_STUB_EMBED_MODEL,
    dimensions: embedding.length,
    embedding,
  };
}
