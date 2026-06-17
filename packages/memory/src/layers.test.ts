import { describe, expect, it } from "vitest";
import { KEENI_MEMORY_LAYERS, listKeeniMemoryLayerIds } from "./layers.js";

describe("KeenAI memory layers", () => {
  it("defines four production layers", () => {
    expect(KEENI_MEMORY_LAYERS).toHaveLength(4);
    expect(listKeeniMemoryLayerIds()).toEqual([
      "observation",
      "episodic",
      "semantic",
      "procedural",
    ]);
  });
});
