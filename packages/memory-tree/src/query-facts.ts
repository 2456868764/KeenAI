import type { KeenaiDb } from "@keenai/storage";
import { memoryFacts, memorySlots } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";

export type MemoryL3Section = {
  title: string;
  body: string;
};

export type QueryMemoryFactsInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  limit?: number;
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
  );

  const factRows = await db
    .select()
    .from(memoryFacts)
    .where(base)
    .orderBy(desc(memoryFacts.importance), desc(memoryFacts.updatedAt))
    .limit(limit);

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
    facts: factRows.map((row) => ({
      id: row.id,
      predicate: row.predicate,
      object: row.object,
      confidence: row.confidence,
      importance: row.importance,
      summaryId: row.summaryId,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
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
