import type { KeenaiDb } from "@keenai/storage";
import { memorySummaries } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { persistMemoryFacts } from "./persist-facts.js";
import { recomputeMemorySlots } from "./recompute-slots.js";
import { episodeTargetFromScopeKey } from "./scope-key.js";
import { type ExtractedMemoryFact, stubExtractFacts } from "./stub-fact-extractor.js";

export type MemoryFactExtractor = {
  model: string;
  extract(input: {
    title: string | null;
    summary: string;
    keyEvents?: string[];
  }): Promise<ExtractedMemoryFact[]>;
};

export type ExtractFactsFromSummaryInput = {
  orgId: string;
  brandId: string;
  summaryId: string;
  factExtractor?: MemoryFactExtractor | null;
};

export type ExtractFactsFromSummaryResult = {
  extracted: boolean;
  summaryId: string;
  scope: string;
  scopeId: string;
  factCount: number;
  slotCount: number;
  reason?: string;
};

/** Extract L3 facts from a sealed summary and project into memory_slots. */
export async function extractFactsFromSummary(
  db: KeenaiDb,
  input: ExtractFactsFromSummaryInput,
): Promise<ExtractFactsFromSummaryResult> {
  const base = {
    extracted: false,
    summaryId: input.summaryId,
    scope: "",
    scopeId: "",
    factCount: 0,
    slotCount: 0,
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
    input.factExtractor ??
    ({
      model: "stub/rules",
      extract: async (payload) => stubExtractFacts(payload),
    } satisfies MemoryFactExtractor);

  const facts = await extractor.extract({
    title: summary.title,
    summary: summary.summary,
    keyEvents: summary.provenance.keyEvents,
  });

  if (facts.length === 0) {
    return { ...base, scope, scopeId, reason: "no_facts" };
  }

  const persisted = await persistMemoryFacts(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scope,
    scopeId,
    summaryId: summary.id,
    facts,
    source: `extract:${extractor.model}`,
  });

  const slots = await recomputeMemorySlots(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scope,
    scopeId,
    source: `summary:${summary.id}`,
  });

  return {
    extracted: true,
    summaryId: summary.id,
    scope,
    scopeId,
    factCount: persisted.upserted,
    slotCount: slots.slotCount,
  };
}

export function createStubMemoryFactExtractor(): MemoryFactExtractor {
  return {
    model: "stub/rules",
    extract: async (payload) => stubExtractFacts(payload),
  };
}
