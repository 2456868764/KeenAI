import type { MemoryLayer } from "./mastra-adapter.js";

export type KeenaiMemoryLayerDefinition = {
  id: MemoryLayer;
  title: string;
  mastraFeature: string;
  keenaiStorage: string;
};

/** Four-layer KeenAI memory model mapped to Mastra + memory-tree storage. */
export const KEENI_MEMORY_LAYERS: readonly KeenaiMemoryLayerDefinition[] = [
  {
    id: "observation",
    title: "L1 · Working / Observations",
    mastraFeature: "thread messages + observationalMemory",
    keenaiStorage: "mastra_messages · memory_observations · memory_chunks",
  },
  {
    id: "episodic",
    title: "L2 · Episodic summaries",
    mastraFeature: "thread titles + semanticRecall",
    keenaiStorage: "memory_episodes · memory_summaries",
  },
  {
    id: "semantic",
    title: "L3 · Facts & slots",
    mastraFeature: "workingMemory template + semanticRecall",
    keenaiStorage: "memory_facts · memory_slots · memory_entities",
  },
  {
    id: "procedural",
    title: "L4 · Patterns & skills",
    mastraFeature: "agent tools + workflow blocks",
    keenaiStorage: "memory_patterns · skills · memory_relations",
  },
] as const;

export function listKeeniMemoryLayerIds(): MemoryLayer[] {
  return KEENI_MEMORY_LAYERS.map((layer) => layer.id);
}
