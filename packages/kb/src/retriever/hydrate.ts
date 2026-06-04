import type { KeenaiDb } from "@keenai/storage";
import { kbChunks } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";

export const KEENI_KB_KB10 = {
  enabled: true,
  target: "kb.search.hydrate",
  notes: "KB-10 stub: leaf hit → section contextPrefix + section summary from siblings/parent.",
} as const;

export const KB_SECTION_SUMMARY_MAX_CHARS = 400;

export type KbChunkHydrateRow = {
  chunkId: string;
  documentId: string;
  sectionId: string | null;
  parentChunkId: string | null;
  contextPrefix: string | null;
  content: string;
  chunkIndex: number;
};

export type HydratedKbChunkContext = {
  contextPrefix: string | null;
  sectionSummary: string | null;
  hydratedContextPrefix: string | null;
};

export type HydrateKbSearchHitsInput = {
  orgId: string;
  brandId: string;
  /** When false, return hits unchanged (KB-10). */
  hydrate?: boolean;
};

/** Build a short section summary from sibling leaf chunks in the same section. */
export function buildKbSectionSummary(
  chunks: Array<{ content: string; chunkIndex: number }>,
  maxChars = KB_SECTION_SUMMARY_MAX_CHARS,
): string | null {
  if (chunks.length === 0) return null;

  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const combined = ordered
    .map((row) => row.content.trim())
    .filter(Boolean)
    .join(" ");
  if (!combined) return null;

  if (combined.length <= maxChars) return combined;
  return `${combined.slice(0, maxChars).trim()}…`;
}

/** Merge section heading prefix and section summary for retrieval context. */
export function mergeKbHydratedContextPrefix(
  contextPrefix: string | null,
  sectionSummary: string | null,
): string | null {
  const parts: string[] = [];
  if (contextPrefix?.trim()) parts.push(contextPrefix.trim());
  if (sectionSummary?.trim()) parts.push(`Section summary: ${sectionSummary.trim()}`);
  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

export function hydrateKbChunkContext(
  hit: KbChunkHydrateRow,
  sectionSummary: string | null,
): HydratedKbChunkContext {
  const hydratedContextPrefix = mergeKbHydratedContextPrefix(hit.contextPrefix, sectionSummary);
  return {
    contextPrefix: hit.contextPrefix,
    sectionSummary,
    hydratedContextPrefix,
  };
}

async function loadSectionChunks(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; documentId: string; sectionId: string },
): Promise<Array<{ content: string; chunkIndex: number }>> {
  const rows = await db
    .select({
      content: kbChunks.content,
      chunkIndex: kbChunks.chunkIndex,
    })
    .from(kbChunks)
    .where(
      and(
        eq(kbChunks.orgId, input.orgId),
        eq(kbChunks.brandId, input.brandId),
        eq(kbChunks.documentId, input.documentId),
        eq(kbChunks.sectionId, input.sectionId),
      ),
    );

  return rows;
}

async function loadParentChunks(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; parentIds: string[] },
): Promise<Map<string, string>> {
  if (input.parentIds.length === 0) return new Map();

  const rows = await db
    .select({ id: kbChunks.id, content: kbChunks.content })
    .from(kbChunks)
    .where(
      and(
        eq(kbChunks.orgId, input.orgId),
        eq(kbChunks.brandId, input.brandId),
        inArray(kbChunks.id, input.parentIds),
      ),
    );

  return new Map(rows.map((row) => [row.id, row.content]));
}

export type HydratedKbSearchHitFields = {
  sectionSummary: string | null;
  hydratedContextPrefix: string | null;
};

/** KB-10: enrich leaf hits with parent section context + section summary. */
export async function hydrateKbSearchHits<THit extends KbChunkHydrateRow & Record<string, unknown>>(
  db: KeenaiDb,
  hits: THit[],
  input: HydrateKbSearchHitsInput,
): Promise<Array<THit & HydratedKbSearchHitFields>> {
  if (input.hydrate === false || hits.length === 0) {
    return hits.map((hit) => ({
      ...hit,
      sectionSummary: null,
      hydratedContextPrefix: hit.contextPrefix,
    }));
  }

  const parentIds = [
    ...new Set(hits.map((hit) => hit.parentChunkId).filter((id): id is string => Boolean(id))),
  ];
  const parentContentById = await loadParentChunks(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    parentIds,
  });

  const sectionKeys = new Map<string, { documentId: string; sectionId: string }>();
  for (const hit of hits) {
    if (!hit.sectionId) continue;
    const key = `${hit.documentId}:${hit.sectionId}`;
    if (!sectionKeys.has(key)) {
      sectionKeys.set(key, { documentId: hit.documentId, sectionId: hit.sectionId });
    }
  }

  const sectionSummaryByKey = new Map<string, string | null>();
  for (const [key, scope] of sectionKeys) {
    const siblings = await loadSectionChunks(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      documentId: scope.documentId,
      sectionId: scope.sectionId,
    });
    sectionSummaryByKey.set(key, buildKbSectionSummary(siblings));
  }

  return hits.map((hit) => {
    let sectionSummary: string | null = null;

    if (hit.parentChunkId) {
      const parentBody = parentContentById.get(hit.parentChunkId);
      if (parentBody) {
        sectionSummary = buildKbSectionSummary([{ content: parentBody, chunkIndex: 0 }]);
      }
    }

    if (!sectionSummary && hit.sectionId) {
      const key = `${hit.documentId}:${hit.sectionId}`;
      sectionSummary = sectionSummaryByKey.get(key) ?? null;
    }

    const hydrated = hydrateKbChunkContext(hit, sectionSummary);
    return {
      ...hit,
      contextPrefix: hydrated.hydratedContextPrefix ?? hit.contextPrefix,
      sectionSummary: hydrated.sectionSummary,
      hydratedContextPrefix: hydrated.hydratedContextPrefix,
    };
  });
}
