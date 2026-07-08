import { type KbChunkDraft, chunkKbDocument } from "../chunk-document.js";
import type { ParsedKbDocument } from "../parse-document.js";

export const KEENI_KB_KB18_CHUNKER = {
  enabled: true,
  target: "kb.ingest.chunker.hierarchical",
  notes:
    "KB-18: heading-aware hierarchical chunker with paragraph/sentence boundaries and overlap.",
} as const;

/** KB-18 hierarchical chunker. */
export function chunkKbDocumentHierarchical(
  parsed: ParsedKbDocument,
  maxChars = 800,
  overlapChars = 120,
): KbChunkDraft[] {
  return chunkKbDocument(parsed, maxChars, overlapChars);
}
