import type { KeenaiDb } from "@keenai/storage";
import { memorySummaries } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { persistMemoryEntities } from "./persist-entities.js";
import { episodeTargetFromScopeKey } from "./scope-key.js";
import { type ExtractedMemoryEntity, stubExtractEntities } from "./stub-entity-extractor.js";

export type MemoryEntityExtractor = {
  model: string;
  extract(input: {
    title: string | null;
    summary: string;
    keyEvents?: string[];
  }): Promise<ExtractedMemoryEntity[]>;
};

export type ExtractEntitiesFromSummaryInput = {
  orgId: string;
  brandId: string;
  summaryId: string;
  entityExtractor?: MemoryEntityExtractor | null;
};

export type ExtractEntitiesFromSummaryResult = {
  extracted: boolean;
  summaryId: string;
  scope: string;
  scopeId: string;
  entityCount: number;
  reason?: string;
};

/** Extract named entities from a sealed summary into memory_entities. */
export async function extractEntitiesFromSummary(
  db: KeenaiDb,
  input: ExtractEntitiesFromSummaryInput,
): Promise<ExtractEntitiesFromSummaryResult> {
  const base = {
    extracted: false,
    summaryId: input.summaryId,
    scope: "",
    scopeId: "",
    entityCount: 0,
  };

  const [summary] = await db
    .select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.id, input.summaryId),
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
      ),
    )
    .limit(1);

  if (!summary) {
    return { ...base, reason: "summary_not_found" };
  }

  if (summary.level !== 1) {
    return { ...base, reason: "not_seal_summary" };
  }

  const { scope, scopeId } = episodeTargetFromScopeKey(summary.scopeKey);
  if (scope === "unknown") {
    return { ...base, scope, scopeId, reason: "unknown_scope" };
  }

  const extractor =
    input.entityExtractor ??
    ({
      model: "stub/rules",
      extract: async (payload) => stubExtractEntities(payload),
    } satisfies MemoryEntityExtractor);

  const entities = await extractor.extract({
    title: summary.title,
    summary: summary.summary,
    keyEvents: summary.provenance.keyEvents,
  });

  if (entities.length === 0) {
    return { ...base, scope, scopeId, reason: "no_entities" };
  }

  const persisted = await persistMemoryEntities(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scope,
    scopeId,
    summaryId: summary.id,
    entities,
  });

  return {
    extracted: true,
    summaryId: summary.id,
    scope,
    scopeId,
    entityCount: persisted.upserted,
  };
}

export function createStubMemoryEntityExtractor(): MemoryEntityExtractor {
  return {
    model: "stub/rules",
    extract: async (payload) => stubExtractEntities(payload),
  };
}
