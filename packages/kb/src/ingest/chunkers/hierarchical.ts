import { type KbChunkDraft, chunkKbDocument } from "../chunk-document.js";
import type { ParsedKbDocument } from "../parse-document.js";

export const KEENI_KB_KB18_CHUNKER = {
  enabled: true,
  target: "kb.ingest.chunker.hierarchical",
  notes: "KB-18 stub: heading-aware hierarchical chunker (semantic/contextual later).",
} as const;

/** KB-18 hierarchical chunker (stub). */
export function chunkKbDocumentHierarchical(
  parsed: ParsedKbDocument,
  maxChars = 800,
): KbChunkDraft[] {
  return chunkKbDocument(parsed, maxChars);
}
