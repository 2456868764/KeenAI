import {
  type KbChunkEmbedder,
  type KbEmbedderProvider,
  createKbChunkEmbedder,
  createXenovaBgeM3KbEmbedder,
  resolveKbEmbedderProvider,
} from "./ingest/embedder.js";
import type { KbQueryEmbedder } from "./search-kb-chunks.js";

/** Build query embedder using the same model as document indexing (KB-07). */
export function createKbQueryEmbedderFromChunkEmbedder(embedder: KbChunkEmbedder): KbQueryEmbedder {
  return {
    async embed(text) {
      return embedder.embed(text);
    },
  };
}

export function createBgeM3KbQueryEmbedder(provider?: KbEmbedderProvider): KbQueryEmbedder {
  const resolved = provider ?? resolveKbEmbedderProvider();
  return createKbQueryEmbedderFromChunkEmbedder(createKbChunkEmbedder(resolved));
}

export { createXenovaBgeM3KbEmbedder, resolveKbEmbedderProvider };
