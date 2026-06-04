import { createHash } from "node:crypto";
import type { KbChunkDraft } from "./chunk-document.js";

export const KEENI_KB_KB17 = {
  enabled: true,
  target: "kb.ingest.diff_index",
  notes: "KB-17: content-hash diff keeps stable chunk_id for unchanged slices.",
} as const;

export type KbIndexedChunkSnapshot = {
  id: string;
  chunkIndex: number;
  contentHash: string;
};

export type KbDiffIndexPlan = {
  keep: Array<{ id: string; draft: KbChunkDraft }>;
  insert: KbChunkDraft[];
  removeIds: string[];
};

export function hashKbChunkContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}

/** Plan incremental re-index: preserve chunk ids when content hash matches (KB-17). */
export function planKbDocumentDiffIndex(
  existing: KbIndexedChunkSnapshot[],
  drafts: KbChunkDraft[],
): KbDiffIndexPlan {
  const byIndex = new Map(existing.map((row) => [row.chunkIndex, row]));
  const keep: Array<{ id: string; draft: KbChunkDraft }> = [];
  const insert: KbChunkDraft[] = [];
  const removeIds: string[] = [];
  const seenIndexes = new Set<number>();

  for (const draft of drafts) {
    seenIndexes.add(draft.chunkIndex);
    const prior = byIndex.get(draft.chunkIndex);
    const hash = hashKbChunkContent(draft.content);
    if (prior && prior.contentHash === hash) {
      keep.push({ id: prior.id, draft });
      continue;
    }
    if (prior) removeIds.push(prior.id);
    insert.push(draft);
  }

  for (const row of existing) {
    if (!seenIndexes.has(row.chunkIndex)) removeIds.push(row.id);
  }

  return { keep, insert, removeIds };
}
