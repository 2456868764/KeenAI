import type { KeenaiDb } from "@keenai/storage";
import { memoryFacts } from "@keenai/storage/schema";
import type { ExtractedMemoryFact } from "./stub-fact-extractor.js";

export type PersistMemoryFactsInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  summaryId: string;
  facts: ExtractedMemoryFact[];
  source?: string;
};

/** Upsert extracted facts keyed by scope + predicate. */
export async function persistMemoryFacts(
  db: KeenaiDb,
  input: PersistMemoryFactsInput,
): Promise<{ factIds: string[]; upserted: number }> {
  const now = new Date();
  const factIds: string[] = [];
  let upserted = 0;

  for (const fact of input.facts) {
    const importance = fact.importance ?? fact.confidence * 0.8;
    const rows = await db
      .insert(memoryFacts)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        scope: input.scope,
        scopeId: input.scopeId,
        predicate: fact.predicate,
        object: fact.object,
        confidence: fact.confidence,
        importance,
        source: input.source ?? `summary:${input.summaryId}`,
        summaryId: input.summaryId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [memoryFacts.scope, memoryFacts.scopeId, memoryFacts.predicate],
        set: {
          object: fact.object,
          confidence: fact.confidence,
          importance,
          source: input.source ?? `summary:${input.summaryId}`,
          summaryId: input.summaryId,
          updatedAt: now,
        },
      })
      .returning({ id: memoryFacts.id });

    const row = rows[0];
    if (row) {
      factIds.push(row.id);
      upserted += 1;
    }
  }

  return { factIds, upserted };
}
