import type { KeenaiDb } from "@keenai/storage";
import { memorySummaries } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { persistMemoryEntities } from "./persist-entities.js";
import { persistMemoryRelations } from "./persist-relations.js";
import { episodeTargetFromScopeKey } from "./scope-key.js";
import type { ExtractedMemoryEntity } from "./stub-entity-extractor.js";
import type { ExtractedMemoryRelation } from "./stub-relation-extractor.js";

export type MemoryKgExtractor = {
  model: string;
  extract(input: {
    title: string | null;
    summary: string;
    keyEvents?: string[];
  }): Promise<{
    entities: ExtractedMemoryEntity[];
    relations: ExtractedMemoryRelation[];
    source?: string;
  }>;
};

export type ExtractKgFromSummaryInput = {
  orgId: string;
  brandId: string;
  summaryId: string;
  kgExtractor?: MemoryKgExtractor | null;
};

export type ExtractKgFromSummaryResult = {
  entityResult: {
    extracted: boolean;
    summaryId: string;
    scope: string;
    scopeId: string;
    entityCount: number;
    reason?: string;
  };
  relationResult: {
    extracted: boolean;
    summaryId: string;
    scope: string;
    scopeId: string;
    relationCount: number;
    reason?: string;
  };
  source?: string;
  model?: string;
};

/** Extract entities + relations in one pass and persist to memory_entities / memory_relations. */
export async function extractKgFromSummary(
  db: KeenaiDb,
  input: ExtractKgFromSummaryInput,
): Promise<ExtractKgFromSummaryResult> {
  const baseEntity = {
    extracted: false,
    summaryId: input.summaryId,
    scope: "",
    scopeId: "",
    entityCount: 0,
  };
  const baseRelation = {
    extracted: false,
    summaryId: input.summaryId,
    scope: "",
    scopeId: "",
    relationCount: 0,
  };

  if (!input.kgExtractor) {
    return {
      entityResult: { ...baseEntity, reason: "extract_disabled" },
      relationResult: { ...baseRelation, reason: "extract_disabled" },
    };
  }

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
    return {
      entityResult: { ...baseEntity, reason: "summary_not_found" },
      relationResult: { ...baseRelation, reason: "summary_not_found" },
    };
  }

  if (summary.level !== 1) {
    return {
      entityResult: { ...baseEntity, reason: "not_seal_summary" },
      relationResult: { ...baseRelation, reason: "not_seal_summary" },
    };
  }

  const { scope, scopeId } = episodeTargetFromScopeKey(summary.scopeKey);
  if (scope === "unknown") {
    return {
      entityResult: { ...baseEntity, scope, scopeId, reason: "unknown_scope" },
      relationResult: { ...baseRelation, scope, scopeId, reason: "unknown_scope" },
    };
  }

  const extracted = await input.kgExtractor.extract({
    title: summary.title,
    summary: summary.summary,
    keyEvents: summary.provenance.keyEvents,
  });

  let entityCount = 0;
  if (extracted.entities.length > 0) {
    const persisted = await persistMemoryEntities(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      scope,
      scopeId,
      summaryId: summary.id,
      entities: extracted.entities,
    });
    entityCount = persisted.upserted;
  }

  let relationCount = 0;
  if (extracted.relations.length > 0) {
    const persisted = await persistMemoryRelations(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      scope,
      scopeId,
      summaryId: summary.id,
      relations: extracted.relations,
    });
    relationCount = persisted.upserted;
  }

  return {
    entityResult: {
      extracted: entityCount > 0,
      summaryId: summary.id,
      scope,
      scopeId,
      entityCount,
      reason:
        entityCount > 0
          ? undefined
          : extracted.entities.length > 0
            ? "persist_failed"
            : "no_entities",
    },
    relationResult: {
      extracted: relationCount > 0,
      summaryId: summary.id,
      scope,
      scopeId,
      relationCount,
      reason:
        relationCount > 0
          ? undefined
          : extracted.relations.length > 0
            ? "entities_not_linked"
            : "no_relations",
    },
    source: extracted.source,
    model: input.kgExtractor.model,
  };
}
