import type { KeenaiDb } from "@keenai/storage";
import { memoryFacts, memorySlots } from "@keenai/storage/schema";
import { and, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";

export type MemoryL3Section = {
  title: string;
  body: string;
  evidence: Array<{
    sourceType: "memory_fact" | "memory_slot";
    sourceId: string;
    scope: string;
    score?: number;
    sourceVersion?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type QueryMemoryFactsInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  limit?: number;
  query?: string;
  minConfidence?: number;
};

export type MemoryFactView = {
  id: string;
  predicate: string;
  object: unknown;
  confidence: number;
  importance: number;
  summaryId: string | null;
  source: string | null;
  updatedAt: string;
  retrievalScore: number;
  retrievalReason: string;
};

export type MemorySlotView = {
  key: string;
  value: unknown;
  source: string | null;
  updatedAt: string;
};

export type QueryMemoryFactsResult = {
  scope: string;
  scopeId: string;
  facts: MemoryFactView[];
  slots: MemorySlotView[];
};

function formatObject(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return JSON.stringify(value);
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9\u3400-\u9fff]+/i)
      .filter((term) => term.length > 1),
  );
}

function factScore(
  row: typeof memoryFacts.$inferSelect,
  query: string | undefined,
  now: number,
): { score: number; reason: string } {
  const ageDays = Math.max(0, now - row.updatedAt.getTime()) / 86_400_000;
  const freshness = Math.exp(-ageDays / 90);
  const queryTerms = terms(query ?? "");
  const factTerms = terms(`${row.predicate} ${formatObject(row.object)}`);
  const overlap =
    queryTerms.size === 0
      ? 0
      : [...queryTerms].filter((term) => factTerms.has(term)).length / queryTerms.size;
  const conflictPenalty = Math.min(0.25, row.conflictCount * 0.05);
  const score = Math.max(
    0,
    row.confidence * 0.4 +
      row.importance * 0.35 +
      freshness * 0.15 +
      overlap * 0.1 -
      conflictPenalty,
  );
  return {
    score: Number(score.toFixed(4)),
    reason: `confidence:${row.confidence.toFixed(2)};importance:${row.importance.toFixed(2)};freshness:${freshness.toFixed(2)};overlap:${overlap.toFixed(2)};conflicts:${row.conflictCount}`,
  };
}

/** Load L3 semantic facts and projected slots for a memory scope. */
export async function queryMemoryFacts(
  db: KeenaiDb,
  input: QueryMemoryFactsInput,
): Promise<QueryMemoryFactsResult> {
  const limit = input.limit ?? 50;
  const base = and(
    eq(memoryFacts.orgId, input.orgId),
    eq(memoryFacts.brandId, input.brandId),
    eq(memoryFacts.scope, input.scope),
    eq(memoryFacts.scopeId, input.scopeId),
    eq(memoryFacts.status, "active"),
    gte(memoryFacts.confidence, input.minConfidence ?? 0.65),
    isNull(memoryFacts.archivedAt),
    or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, new Date())),
  );

  const factRows = await db
    .select()
    .from(memoryFacts)
    .where(base)
    .orderBy(desc(memoryFacts.importance), desc(memoryFacts.updatedAt))
    .limit(Math.min(200, limit * 3));

  const now = Date.now();
  const rankedFacts = factRows
    .map((row) => ({ row, ranking: factScore(row, input.query, now) }))
    .sort((a, b) => b.ranking.score - a.ranking.score)
    .slice(0, limit);

  if (rankedFacts.length > 0) {
    await db
      .update(memoryFacts)
      .set({
        lastAccessAt: new Date(),
        accessCount: sql`${memoryFacts.accessCount} + 1`,
      })
      .where(or(...rankedFacts.map(({ row }) => eq(memoryFacts.id, row.id))));
  }

  const slotRows = await db
    .select()
    .from(memorySlots)
    .where(
      and(
        eq(memorySlots.orgId, input.orgId),
        eq(memorySlots.brandId, input.brandId),
        eq(memorySlots.scope, input.scope),
        eq(memorySlots.scopeId, input.scopeId),
      ),
    )
    .orderBy(memorySlots.key)
    .limit(limit);

  return {
    scope: input.scope,
    scopeId: input.scopeId,
    facts: rankedFacts.map(({ row, ranking }) => ({
      id: row.id,
      predicate: row.predicate,
      object: row.object,
      confidence: row.confidence,
      importance: row.importance,
      summaryId: row.summaryId,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
      retrievalScore: ranking.score,
      retrievalReason: ranking.reason,
    })),
    slots: slotRows.map((row) => ({
      key: row.key,
      value: row.value,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export function buildMemoryL3Section(result: QueryMemoryFactsResult): MemoryL3Section | null {
  if (result.facts.length === 0 && result.slots.length === 0) return null;

  const lines: string[] = [];

  if (result.facts.length > 0) {
    lines.push("Facts:");
    for (const fact of result.facts) {
      lines.push(
        `- ${fact.predicate}: ${formatObject(fact.object)} (confidence ${fact.confidence.toFixed(2)})`,
      );
    }
  }

  if (result.slots.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Slots:");
    for (const slot of result.slots) {
      lines.push(`- ${slot.key}: ${formatObject(slot.value)}`);
    }
  }

  return {
    title: `Semantic memory (L3 · ${result.scope})`,
    body: lines.join("\n"),
    evidence: [
      ...result.facts.map((fact) => ({
        sourceType: "memory_fact" as const,
        sourceId: fact.id,
        scope: result.scope,
        score: fact.retrievalScore,
        sourceVersion: fact.updatedAt,
        metadata: { reason: fact.retrievalReason },
      })),
      ...result.slots.map((slot) => ({
        sourceType: "memory_slot" as const,
        sourceId: `${result.scope}:${result.scopeId}:${slot.key}`,
        scope: result.scope,
        sourceVersion: slot.updatedAt,
      })),
    ],
  };
}

/** Resolve API scope + id into memory_facts scope keys. */
export function resolveMemoryFactsScope(input: {
  scope: "conversation" | "customer" | "channel";
  id: string;
  channelType?: string;
}): { scope: string; scopeId: string } | { error: string } {
  if (input.scope === "conversation") {
    return { scope: "conversation", scopeId: input.id };
  }
  if (input.scope === "customer") {
    return { scope: "customer", scopeId: input.id };
  }
  if (!input.channelType) {
    return { error: "channelType_required" };
  }
  return { scope: "channel", scopeId: `${input.channelType}:${input.id}` };
}
