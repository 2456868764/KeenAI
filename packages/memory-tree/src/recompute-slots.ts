import type { KeenaiDb } from "@keenai/storage";
import { memoryFacts, memorySlots } from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";

export type RecomputeMemorySlotsInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  source?: string;
};

/** Project memory_facts into memory_slots (predicate → slot key). */
export async function recomputeMemorySlots(
  db: KeenaiDb,
  input: RecomputeMemorySlotsInput,
): Promise<{ slotCount: number }> {
  const facts = await db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.orgId, input.orgId),
        eq(memoryFacts.scope, input.scope),
        eq(memoryFacts.scopeId, input.scopeId),
        isNull(memoryFacts.archivedAt),
      ),
    );

  const now = new Date();
  for (const fact of facts) {
    await db
      .insert(memorySlots)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        scope: input.scope,
        scopeId: input.scopeId,
        key: fact.predicate,
        value: fact.object,
        source: input.source ?? fact.source ?? "facts_projection",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [memorySlots.scope, memorySlots.scopeId, memorySlots.key],
        set: {
          value: fact.object,
          source: input.source ?? fact.source ?? "facts_projection",
          updatedAt: now,
        },
      });
  }

  return { slotCount: facts.length };
}
