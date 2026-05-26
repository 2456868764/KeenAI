import { createStubKbQueryEmbedder } from "@keenai/kb";
import type { KbContextSearch } from "@keenai/memory-tree";
import { getKbChunkFtsStore } from "./kb-chunk-fts-init.js";
import { getKbChunkVectorStore } from "./kb-chunk-vector-init.js";

/** KB hybrid search config for agent context assembly when FTS is available. */
export function getKbContextSearch(limit = 5): KbContextSearch | null {
  const chunkFts = getKbChunkFtsStore();
  if (!chunkFts) return null;

  return {
    chunkFts,
    chunkVector: getKbChunkVectorStore(),
    queryEmbedder: createStubKbQueryEmbedder(),
    limit,
  };
}
