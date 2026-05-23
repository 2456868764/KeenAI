import type { KeenaiDb } from "@keenai/storage";
import { memoryFacts } from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  type ComputeDecayedFactInput,
  DEFAULT_MIN_CONFIDENCE,
  computeDecayedFactScore,
} from "./decay.js";
import { DEFAULT_MAX_FACTS_PER_SCOPE, evictionScore } from "./eviction.js";
import { recomputeMemorySlots } from "./recompute-slots.js";

export type MemoryScopeKey = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
};

export type ConsolidateMemoryScopeInput = MemoryScopeKey & {
  source?: string;
};

export type ConsolidateMemoryScopeResult = {
  scope: string;
  scopeId: string;
  slotCount: number;
};

/** Re-project active facts into slots for one scope. */
export async function consolidateMemoryScope(
  db: KeenaiDb,
  input: ConsolidateMemoryScopeInput,
): Promise<ConsolidateMemoryScopeResult> {
  const slots = await recomputeMemorySlots(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scope: input.scope,
    scopeId: input.scopeId,
    source: input.source ?? "consolidate",
  });

  return {
    scope: input.scope,
    scopeId: input.scopeId,
    slotCount: slots.slotCount,
  };
}

export type RunMemoryConsolidationInput = {
  orgId?: string;
  brandId?: string;
};

export type RunMemoryConsolidationResult = {
  scopesProcessed: number;
  totalSlots: number;
  results: ConsolidateMemoryScopeResult[];
};

async function listActiveMemoryScopes(
  db: KeenaiDb,
  input: RunMemoryConsolidationInput,
): Promise<MemoryScopeKey[]> {
  const conditions = [isNull(memoryFacts.archivedAt)];
  if (input.orgId) conditions.push(eq(memoryFacts.orgId, input.orgId));
  if (input.brandId) conditions.push(eq(memoryFacts.brandId, input.brandId));

  const rows = await db
    .select({
      orgId: memoryFacts.orgId,
      brandId: memoryFacts.brandId,
      scope: memoryFacts.scope,
      scopeId: memoryFacts.scopeId,
    })
    .from(memoryFacts)
    .where(and(...conditions));

  const seen = new Set<string>();
  const scopes: MemoryScopeKey[] = [];
  for (const row of rows) {
    if (!row.brandId) continue;
    const key = `${row.orgId}:${row.brandId}:${row.scope}:${row.scopeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({
      orgId: row.orgId,
      brandId: row.brandId,
      scope: row.scope,
      scopeId: row.scopeId,
    });
  }
  return scopes;
}

/** Hourly consolidation: re-project slots for all active fact scopes. */
export async function runMemoryConsolidation(
  db: KeenaiDb,
  input: RunMemoryConsolidationInput = {},
): Promise<RunMemoryConsolidationResult> {
  const scopes = await listActiveMemoryScopes(db, input);
  const results: ConsolidateMemoryScopeResult[] = [];

  for (const scope of scopes) {
    results.push(await consolidateMemoryScope(db, scope));
  }

  return {
    scopesProcessed: results.length,
    totalSlots: results.reduce((sum, row) => sum + row.slotCount, 0),
    results,
  };
}

export type RunMemoryDecaySweepInput = {
  orgId?: string;
  brandId?: string;
  now?: Date;
  halfLifeDays?: number;
  minConfidence?: number;
  maxFactsPerScope?: number;
};

export type RunMemoryDecaySweepResult = {
  factsScanned: number;
  factsDecayed: number;
  factsArchived: number;
  factsEvicted: number;
};

type ActiveFactRow = typeof memoryFacts.$inferSelect;

function scopeGroupKey(row: ActiveFactRow): string {
  return `${row.orgId}:${row.brandId ?? ""}:${row.scope}:${row.scopeId}`;
}

async function loadActiveFacts(
  db: KeenaiDb,
  input: RunMemoryDecaySweepInput,
): Promise<ActiveFactRow[]> {
  const conditions = [isNull(memoryFacts.archivedAt)];
  if (input.orgId) conditions.push(eq(memoryFacts.orgId, input.orgId));
  if (input.brandId) conditions.push(eq(memoryFacts.brandId, input.brandId));
  return db
    .select()
    .from(memoryFacts)
    .where(and(...conditions));
}

/** Daily decay sweep: decay confidence, archive weak facts, evict overflow by score. */
export async function runMemoryDecaySweep(
  db: KeenaiDb,
  input: RunMemoryDecaySweepInput = {},
): Promise<RunMemoryDecaySweepResult> {
  const now = input.now ?? new Date();
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxFactsPerScope = input.maxFactsPerScope ?? DEFAULT_MAX_FACTS_PER_SCOPE;
  const facts = await loadActiveFacts(db, input);

  let factsDecayed = 0;
  let factsArchived = 0;
  const updatedByScope = new Map<string, ActiveFactRow[]>();

  for (const fact of facts) {
    const decayInput: ComputeDecayedFactInput = {
      confidence: fact.confidence,
      importance: fact.importance,
      accessCount: fact.accessCount,
      lastAccessAt: fact.lastAccessAt,
      updatedAt: fact.updatedAt,
      now,
      halfLifeDays: input.halfLifeDays,
      minConfidence,
    };
    const scored = computeDecayedFactScore(decayInput, evictionScore);

    if (scored.shouldArchive) {
      await db
        .update(memoryFacts)
        .set({
          confidence: scored.confidence,
          evictionScore: scored.evictionScore,
          archivedAt: now,
          updatedAt: now,
        })
        .where(eq(memoryFacts.id, fact.id));
      factsArchived += 1;
      continue;
    }

    await db
      .update(memoryFacts)
      .set({
        confidence: scored.confidence,
        evictionScore: scored.evictionScore,
        updatedAt: now,
      })
      .where(eq(memoryFacts.id, fact.id));
    factsDecayed += 1;

    const updated: ActiveFactRow = {
      ...fact,
      confidence: scored.confidence,
      evictionScore: scored.evictionScore,
      updatedAt: now,
    };
    const key = scopeGroupKey(updated);
    const group = updatedByScope.get(key) ?? [];
    group.push(updated);
    updatedByScope.set(key, group);
  }

  let factsEvicted = 0;
  for (const group of updatedByScope.values()) {
    if (group.length <= maxFactsPerScope) continue;

    const sorted = [...group].sort((a, b) => (a.evictionScore ?? 0) - (b.evictionScore ?? 0));
    const overflow = sorted.slice(0, group.length - maxFactsPerScope);

    for (const fact of overflow) {
      await db
        .update(memoryFacts)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(memoryFacts.id, fact.id));
      factsEvicted += 1;
    }
  }

  return {
    factsScanned: facts.length,
    factsDecayed,
    factsArchived,
    factsEvicted,
  };
}
