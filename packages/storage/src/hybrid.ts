import type { FTSStore, FtsHit, FtsQuery } from "./core/fts-store.js";
import type { VectorHit, VectorQuery, VectorStore } from "./core/vector-store.js";

export type RankedHit = {
  id: string;
  score?: number;
};

export type RrfFuseOptions = {
  /** Reciprocal rank fusion constant (default 60). */
  k?: number;
  /** Per-list multipliers; defaults to 1 for each list. */
  weights?: number[];
  topK?: number;
};

export type HybridFusedHit = {
  id: string;
  score: number;
  sources: Array<"fts" | "vector">;
};

export type HybridSearchInput = {
  ftsStore?: FTSStore;
  vectorStore?: VectorStore;
  fts?: FtsQuery;
  vector?: VectorQuery;
  k?: number;
  weights?: { fts?: number; vector?: number };
  topK?: number;
};

/** Reciprocal rank fusion over one or more ranked id lists. */
export function rrfFuse(lists: RankedHit[][], options: RrfFuseOptions = {}): HybridFusedHit[] {
  const k = options.k ?? 60;
  const weights = options.weights ?? lists.map(() => 1);
  const topK = options.topK ?? 20;

  const scores = new Map<string, number>();
  const sources = new Map<string, Set<"fts" | "vector">>();

  for (let listIndex = 0; listIndex < lists.length; listIndex++) {
    const list = lists[listIndex];
    if (!list) continue;
    const weight = weights[listIndex] ?? 1;
    const source = listIndex === 0 ? "fts" : listIndex === 1 ? "vector" : undefined;

    for (let rank = 0; rank < list.length; rank++) {
      const hit = list[rank];
      if (!hit) continue;
      const contribution = weight * (1 / (k + rank + 1));
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + contribution);
      if (source) {
        const set = sources.get(hit.id) ?? new Set();
        set.add(source);
        sources.set(hit.id, set);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({
      id,
      score,
      sources: [...(sources.get(id) ?? [])],
    }));
}

function toRankedHits(hits: FtsHit[] | VectorHit[]): RankedHit[] {
  return hits.map((hit) => ({ id: hit.id, score: hit.score }));
}

/** Parallel FTS + vector search with RRF fusion (Keeni Memory / KB hybrid retriever base). */
export async function hybridSearch(input: HybridSearchInput): Promise<HybridFusedHit[]> {
  const topK = input.topK ?? 20;
  const ftsWeight = input.weights?.fts ?? 1;
  const vectorWeight = input.weights?.vector ?? 1;

  const tasks: Promise<RankedHit[]>[] = [];

  if (input.ftsStore && input.fts) {
    tasks.push(input.ftsStore.search(input.fts).then(toRankedHits));
  }
  if (input.vectorStore && input.vector) {
    tasks.push(input.vectorStore.query(input.vector).then(toRankedHits));
  }

  if (tasks.length === 0) return [];

  const lists = await Promise.all(tasks);
  let weights: number[];
  if (lists.length === 2) {
    weights = [ftsWeight, vectorWeight];
  } else if (lists.length === 1) {
    weights = [input.ftsStore && input.fts ? ftsWeight : vectorWeight];
  } else {
    weights = lists.map(() => 1);
  }

  return rrfFuse(lists, { k: input.k, weights, topK });
}
