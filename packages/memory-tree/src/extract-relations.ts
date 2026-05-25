import type { KeenaiDb } from "@keenai/storage";
import { memorySummaries } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { persistMemoryRelations } from "./persist-relations.js";
import { episodeTargetFromScopeKey } from "./scope-key.js";
import { type ExtractedMemoryRelation, stubExtractRelations } from "./stub-relation-extractor.js";

export type MemoryRelationExtractor = {
  model: string;
  extract(input: {
    title: string | null;
    summary: string;
    keyEvents?: string[];
  }): Promise<ExtractedMemoryRelation[]>;
};

export type ExtractRelationsFromSummaryInput = {
  orgId: string;
  brandId: string;
  summaryId: string;
  relationExtractor?: MemoryRelationExtractor | null;
};

export type ExtractRelationsFromSummaryResult = {
  extracted: boolean;
  summaryId: string;
  scope: string;
  scopeId: string;
  relationCount: number;
  reason?: string;
};

/** Extract entity relations from a sealed summary into memory_relations. */
export async function extractRelationsFromSummary(
  db: KeenaiDb,
  input: ExtractRelationsFromSummaryInput,
): Promise<ExtractRelationsFromSummaryResult> {
  const base = {
    extracted: false,
    summaryId: input.summaryId,
    scope: "",
    scopeId: "",
    relationCount: 0,
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
    input.relationExtractor ??
    ({
      model: "stub/rules",
      extract: async (payload) => stubExtractRelations(payload),
    } satisfies MemoryRelationExtractor);

  const relations = await extractor.extract({
    title: summary.title,
    summary: summary.summary,
    keyEvents: summary.provenance.keyEvents,
  });

  if (relations.length === 0) {
    return { ...base, scope, scopeId, reason: "no_relations" };
  }

  const persisted = await persistMemoryRelations(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scope,
    scopeId,
    summaryId: summary.id,
    relations,
  });

  if (persisted.upserted === 0) {
    return { ...base, scope, scopeId, reason: "entities_not_linked" };
  }

  return {
    extracted: true,
    summaryId: summary.id,
    scope,
    scopeId,
    relationCount: persisted.upserted,
  };
}

export function createStubMemoryRelationExtractor(): MemoryRelationExtractor {
  return {
    model: "stub/rules",
    extract: async (payload) => stubExtractRelations(payload),
  };
}
