import type { MemoryFactExtractor } from "@keenai/memory-tree";
import { createStubMemoryFactExtractor } from "@keenai/memory-tree";

let factExtractor: MemoryFactExtractor | null = createStubMemoryFactExtractor();

export function setMemoryFactExtractor(extractor: MemoryFactExtractor | null): void {
  factExtractor = extractor;
}

export function getMemoryFactExtractor(): MemoryFactExtractor | null {
  return factExtractor;
}
