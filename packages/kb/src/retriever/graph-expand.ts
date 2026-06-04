import type { KeenaiDb } from "@keenai/storage";
import { KB_GRAPH_EXPAND_RELATION_TYPES, kbEntities, kbRelations } from "@keenai/storage/schema";
import { and, eq, inArray, or } from "drizzle-orm";

export const KEENI_KB_KB09 = {
  enabled: true,
  target: "kb.search.graph_expand",
  notes: "KB-09 stub: query → entity match → 1-hop documented_in/depends_on → chunk_ids.",
} as const;

export const KB_GRAPH_EXPAND_LIMIT = 15;
export const KB_RRF_WEIGHTS_DEFAULT = {
  fts: 0.35,
  vector: 0.45,
  graph: 0.2,
} as const;

export type KbRetrievalSource = "fts" | "vector" | "graph";

export type KbRankedChunkHit = {
  id: string;
  score?: number;
};

export type KbFusedChunkHit = {
  id: string;
  score: number;
  sources: KbRetrievalSource[];
};

export type ExpandKbGraphChunksInput = {
  orgId: string;
  brandId: string;
  q: string;
  limit?: number;
};

export type ExpandKbGraphChunksResult = {
  hits: KbRankedChunkHit[];
  matchedEntityIds: string[];
};

/** Tokenize query for stub entity linking (no LLM). */
export function tokenizeKbQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

/** Score how well an entity name/aliases match the query (0–1). */
export function scoreKbEntityQueryMatch(
  query: string,
  entity: { name: string; aliases: string[] },
): number {
  const terms = tokenizeKbQuery(query);
  if (terms.length === 0) return 0;

  const haystacks = [entity.name, ...entity.aliases].map((value) => value.toLowerCase());
  let hits = 0;
  for (const term of terms) {
    if (haystacks.some((haystack) => haystack.includes(term))) hits += 1;
  }
  return hits / terms.length;
}

/** Weighted RRF over FTS + vector + graph lists (KB-09). */
export function fuseKbChunkRankings(
  lists: Array<{ hits: KbRankedChunkHit[]; source: KbRetrievalSource; weight: number }>,
  options?: { k?: number; topK?: number },
): KbFusedChunkHit[] {
  const k = options?.k ?? 60;
  const topK = options?.topK ?? 40;
  const scores = new Map<string, number>();
  const sources = new Map<string, Set<KbRetrievalSource>>();

  for (const list of lists) {
    if (list.hits.length === 0 || list.weight <= 0) continue;

    for (let rank = 0; rank < list.hits.length; rank++) {
      const hit = list.hits[rank];
      if (!hit) continue;
      const contribution = list.weight * (1 / (k + rank + 1));
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + contribution);
      const set = sources.get(hit.id) ?? new Set();
      set.add(list.source);
      sources.set(hit.id, set);
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

/** KB-09: entity-link 1-hop expansion → chunk id candidates. */
export async function expandKbChunksFromGraph(
  db: KeenaiDb,
  input: ExpandKbGraphChunksInput,
): Promise<ExpandKbGraphChunksResult> {
  const limit = input.limit ?? KB_GRAPH_EXPAND_LIMIT;
  const terms = tokenizeKbQuery(input.q);
  if (terms.length === 0) {
    return { hits: [], matchedEntityIds: [] };
  }

  const entityRows = await db
    .select()
    .from(kbEntities)
    .where(and(eq(kbEntities.orgId, input.orgId), eq(kbEntities.brandId, input.brandId)));

  const matched = entityRows
    .map((row) => ({
      row,
      matchScore: scoreKbEntityQueryMatch(input.q, {
        name: row.name,
        aliases: row.aliases ?? [],
      }),
    }))
    .filter((entry) => entry.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  if (matched.length === 0) {
    return { hits: [], matchedEntityIds: [] };
  }

  const matchedIds = matched.map((entry) => entry.row.id);
  const matchScoreById = new Map(matched.map((entry) => [entry.row.id, entry.matchScore]));

  const relationRows = await db
    .select()
    .from(kbRelations)
    .where(
      and(
        eq(kbRelations.orgId, input.orgId),
        eq(kbRelations.brandId, input.brandId),
        inArray(kbRelations.relationType, [...KB_GRAPH_EXPAND_RELATION_TYPES]),
        or(
          inArray(kbRelations.fromEntityId, matchedIds),
          inArray(kbRelations.toEntityId, matchedIds),
        ),
      ),
    );

  const neighborIds = new Set<string>();
  for (const relation of relationRows) {
    if (matchedIds.includes(relation.fromEntityId)) neighborIds.add(relation.toEntityId);
    if (matchedIds.includes(relation.toEntityId)) neighborIds.add(relation.fromEntityId);
  }

  const neighborRows =
    neighborIds.size > 0
      ? await db
          .select()
          .from(kbEntities)
          .where(
            and(
              eq(kbEntities.orgId, input.orgId),
              eq(kbEntities.brandId, input.brandId),
              inArray(kbEntities.id, [...neighborIds]),
            ),
          )
      : [];

  const entityById = new Map([...entityRows, ...neighborRows].map((row) => [row.id, row]));
  const chunkScores = new Map<string, number>();

  const bumpChunk = (chunkId: string, score: number) => {
    chunkScores.set(chunkId, Math.max(chunkScores.get(chunkId) ?? 0, score));
  };

  for (const { row, matchScore } of matched) {
    for (const chunkId of row.chunkIds ?? []) {
      bumpChunk(chunkId, matchScore);
    }
  }

  for (const relation of relationRows) {
    const fromMatch = matchScoreById.get(relation.fromEntityId) ?? 0;
    const toMatch = matchScoreById.get(relation.toEntityId) ?? 0;
    const relationScore = Math.max(fromMatch, toMatch) * relation.confidence;

    const fromEntity = entityById.get(relation.fromEntityId);
    const toEntity = entityById.get(relation.toEntityId);
    for (const chunkId of fromEntity?.chunkIds ?? []) bumpChunk(chunkId, relationScore);
    for (const chunkId of toEntity?.chunkIds ?? []) bumpChunk(chunkId, relationScore);
    for (const chunkId of relation.evidenceChunkIds ?? []) bumpChunk(chunkId, relationScore);
  }

  const hits = [...chunkScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ id, score }));

  return { hits, matchedEntityIds: matchedIds };
}
