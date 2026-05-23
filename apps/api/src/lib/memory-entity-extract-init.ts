import type { MemoryEntityExtractor } from "@keenai/memory-tree";
import { createStubMemoryEntityExtractor } from "@keenai/memory-tree";

let entityExtractor: MemoryEntityExtractor | null = createStubMemoryEntityExtractor();

export function setMemoryEntityExtractor(extractor: MemoryEntityExtractor | null): void {
  entityExtractor = extractor;
}

export function getMemoryEntityExtractor(): MemoryEntityExtractor | null {
  return entityExtractor;
}
