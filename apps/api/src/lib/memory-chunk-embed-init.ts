import type { MemoryChunkEmbedder } from "@keenai/memory-tree";
import {
  createOpenAiMemoryChunkEmbedder,
  createStubMemoryChunkEmbedder,
} from "@keenai/memory-tree";
import type { ApiEnv } from "@keenai/shared";

let chunkEmbedder: MemoryChunkEmbedder | null = null;

export function resolveMemoryChunkEmbedder(env: ApiEnv): MemoryChunkEmbedder | null {
  if (!env.MEMORY_TREE_EMBED_ENABLED) return null;

  if (env.MEMORY_TREE_EMBED_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) return null;
    return createOpenAiMemoryChunkEmbedder({
      apiKey: env.OPENAI_API_KEY,
      model: env.MEMORY_TREE_EMBED_MODEL,
      dimensions: env.MEMORY_TREE_EMBED_DIMENSIONS,
    });
  }

  return createStubMemoryChunkEmbedder(env.MEMORY_TREE_EMBED_DIMENSIONS);
}

export function setMemoryChunkEmbedder(embedder: MemoryChunkEmbedder | null): void {
  chunkEmbedder = embedder;
}

export function getMemoryChunkEmbedder(): MemoryChunkEmbedder | null {
  return chunkEmbedder;
}
