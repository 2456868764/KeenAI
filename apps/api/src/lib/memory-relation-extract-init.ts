import type { MemoryRelationExtractor } from "@keenai/memory-tree";
import { createStubMemoryRelationExtractor } from "@keenai/memory-tree";

let relationExtractor: MemoryRelationExtractor | null = createStubMemoryRelationExtractor();

export function setMemoryRelationExtractor(extractor: MemoryRelationExtractor | null): void {
  relationExtractor = extractor;
}

export function getMemoryRelationExtractor(): MemoryRelationExtractor | null {
  return relationExtractor;
}
