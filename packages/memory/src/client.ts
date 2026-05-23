import { queryMemoryFacts, recomputeMemorySlots, searchMemoryChunks } from "@keenai/memory-tree";
import { memoryFacts, memorySlots } from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import type {
  KeenaiMemory,
  KeenaiMemoryDeps,
  MemoryForgetInput,
  MemoryForgetResult,
  MemoryGetInput,
  MemoryGetResult,
  MemoryRecallInput,
  MemoryRecallResult,
  MemoryStoreInput,
  MemoryStoreResult,
} from "./types.js";

/** Create the unified KeenAI memory facade over memory-tree storage. */
export function createKeenaiMemory(deps: KeenaiMemoryDeps): KeenaiMemory {
  const { db } = deps;

  return {
    async store(input: MemoryStoreInput): Promise<MemoryStoreResult> {
      const now = new Date();
      const confidence = input.confidence ?? 1;
      const importance = input.importance ?? 0.7;

      const rows = await db
        .insert(memoryFacts)
        .values({
          orgId: input.orgId,
          brandId: input.brandId,
          scope: input.scope,
          scopeId: input.scopeId,
          predicate: input.predicate,
          object: input.object,
          confidence,
          importance,
          source: input.source ?? "memory.store",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [memoryFacts.scope, memoryFacts.scopeId, memoryFacts.predicate],
          set: {
            object: input.object,
            confidence,
            importance,
            source: input.source ?? "memory.store",
            archivedAt: null,
            updatedAt: now,
          },
        })
        .returning({ id: memoryFacts.id });

      const factId = rows[0]?.id;
      if (!factId) throw new Error("memory_store_failed");

      const slots = await recomputeMemorySlots(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        scope: input.scope,
        scopeId: input.scopeId,
        source: input.source ?? "memory.store",
      });

      return { factId, slotCount: slots.slotCount };
    },

    async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
      return searchMemoryChunks(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        q: input.q,
        scope: input.scope,
        limit: input.limit,
        chunkFts: deps.chunkFts,
        chunkVector: deps.chunkVector,
        queryEmbedder: deps.queryEmbedder,
        summaryFts: deps.summaryFts,
      });
    },

    async get(input: MemoryGetInput): Promise<MemoryGetResult> {
      const result = await queryMemoryFacts(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        scope: input.scope,
        scopeId: input.scopeId,
        limit: input.limit,
      });

      if (!input.predicate) return result;

      return {
        ...result,
        facts: result.facts.filter((fact) => fact.predicate === input.predicate),
        slots: result.slots.filter((slot) => slot.key === input.predicate),
      };
    },

    async forget(input: MemoryForgetInput): Promise<MemoryForgetResult> {
      const now = new Date();
      const conditions = [
        eq(memoryFacts.orgId, input.orgId),
        eq(memoryFacts.brandId, input.brandId),
        eq(memoryFacts.scope, input.scope),
        eq(memoryFacts.scopeId, input.scopeId),
        isNull(memoryFacts.archivedAt),
      ];

      if (input.factId) conditions.push(eq(memoryFacts.id, input.factId));
      if (input.predicate) conditions.push(eq(memoryFacts.predicate, input.predicate));

      const rows = await db
        .update(memoryFacts)
        .set({
          archivedAt: now,
          updatedAt: now,
          source: input.reason ? `forget:${input.reason}` : "memory.forget",
        })
        .where(and(...conditions))
        .returning({ id: memoryFacts.id });

      await recomputeMemorySlots(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        scope: input.scope,
        scopeId: input.scopeId,
        source: "memory.forget",
      });

      const activeFacts = await db
        .select({ predicate: memoryFacts.predicate })
        .from(memoryFacts)
        .where(
          and(
            eq(memoryFacts.orgId, input.orgId),
            eq(memoryFacts.brandId, input.brandId),
            eq(memoryFacts.scope, input.scope),
            eq(memoryFacts.scopeId, input.scopeId),
            isNull(memoryFacts.archivedAt),
          ),
        );
      const activeKeys = new Set(activeFacts.map((row) => row.predicate));
      const slotRows = await db
        .select({ id: memorySlots.id, key: memorySlots.key })
        .from(memorySlots)
        .where(
          and(
            eq(memorySlots.orgId, input.orgId),
            eq(memorySlots.brandId, input.brandId),
            eq(memorySlots.scope, input.scope),
            eq(memorySlots.scopeId, input.scopeId),
          ),
        );
      for (const slot of slotRows) {
        if (activeKeys.has(slot.key)) continue;
        await db.delete(memorySlots).where(eq(memorySlots.id, slot.id));
      }

      return { forgotten: rows.length };
    },
  };
}
