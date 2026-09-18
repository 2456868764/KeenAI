import { createHash } from "node:crypto";
import type { KeenaiDb } from "@keenai/storage";
import { memoryFactVersions, memoryFacts } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { ExtractedMemoryFact } from "./stub-fact-extractor.js";

export type PersistMemoryFactsInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  summaryId: string;
  facts: ExtractedMemoryFact[];
  source?: string;
  sourceVersion?: string;
};

export type PersistMemoryFactsResult = {
  factIds: string[];
  upserted: number;
  rejected: number;
  conflicted: number;
};

const MIN_CONFIDENCE = 0.65;
const SENSITIVE_VALUE = /(?:api[_-]?key|password|secret|bearer\s+[a-z0-9._-]+|\b\d{13,19}\b)/i;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentHash(fact: ExtractedMemoryFact): string {
  return createHash("sha256")
    .update(`${fact.predicate}\n${stableJson(fact.object)}`)
    .digest("hex");
}

function expiresAtFor(category: string, now: Date): Date {
  const days =
    category === "history" || category === "contact" ? 365 : category === "preference" ? 180 : 90;
  return new Date(now.getTime() + days * 24 * 60 * 60_000);
}

function rejectionReason(fact: ExtractedMemoryFact): string | null {
  if (!fact.predicate.trim() || fact.predicate.length > 128) return "invalid_predicate";
  if (fact.confidence < MIN_CONFIDENCE || fact.confidence > 1) return "low_confidence";
  if (SENSITIVE_VALUE.test(`${fact.predicate}:${stableJson(fact.object)}`)) {
    return "sensitive_value_blocked";
  }
  return null;
}

/** Validate, version and project extracted facts into the active memory view. */
export async function persistMemoryFacts(
  db: KeenaiDb,
  input: PersistMemoryFactsInput,
): Promise<PersistMemoryFactsResult> {
  const now = new Date();
  const factIds: string[] = [];
  let upserted = 0;
  let rejected = 0;
  let conflicted = 0;
  const source = input.source ?? `summary:${input.summaryId}`;
  const sourceVersion = input.sourceVersion ?? input.summaryId;

  for (const fact of input.facts) {
    const importance = fact.importance ?? fact.confidence * 0.8;
    const hash = contentHash(fact);
    const expiresAt = expiresAtFor(fact.category, now);
    const [existing] = await db
      .select()
      .from(memoryFacts)
      .where(
        and(
          eq(memoryFacts.orgId, input.orgId),
          eq(memoryFacts.scope, input.scope),
          eq(memoryFacts.scopeId, input.scopeId),
          eq(memoryFacts.predicate, fact.predicate),
        ),
      )
      .limit(1);
    const invalidReason = rejectionReason(fact);
    const conflicts = Boolean(
      existing &&
        existing.contentHash !== hash &&
        stableJson(existing.object) !== stableJson(fact.object),
    );
    const existingExpired = Boolean(
      existing?.expiresAt && existing.expiresAt.getTime() <= now.getTime(),
    );
    const winsConflict =
      !conflicts || existingExpired || fact.confidence >= (existing?.confidence ?? 0) + 0.1;
    const decision = invalidReason ? "rejected" : winsConflict ? "accepted" : "contested";
    const reason = invalidReason ?? (winsConflict ? null : "conflicting_fact_requires_review");
    let factId = existing?.id ?? null;

    if (!invalidReason && winsConflict) {
      const rows = await db
        .insert(memoryFacts)
        .values({
          orgId: input.orgId,
          brandId: input.brandId,
          scope: input.scope,
          scopeId: input.scopeId,
          predicate: fact.predicate,
          object: fact.object,
          category: fact.category,
          status: "active",
          confidence: fact.confidence,
          importance,
          source,
          sourceVersion,
          contentHash: hash,
          expiresAt,
          summaryId: input.summaryId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [memoryFacts.scope, memoryFacts.scopeId, memoryFacts.predicate],
          set: {
            object: fact.object,
            category: fact.category,
            status: "active",
            confidence: fact.confidence,
            importance,
            source,
            sourceVersion,
            contentHash: hash,
            expiresAt,
            summaryId: input.summaryId,
            updatedAt: now,
          },
        })
        .returning({ id: memoryFacts.id });
      const row = rows[0];
      if (row) {
        factId = row.id;
        factIds.push(row.id);
        upserted += 1;
      }
    } else if (invalidReason) {
      rejected += 1;
    } else {
      conflicted += 1;
      if (existing) {
        await db
          .update(memoryFacts)
          .set({ conflictCount: existing.conflictCount + 1, updatedAt: now })
          .where(eq(memoryFacts.id, existing.id));
      }
    }

    await db.insert(memoryFactVersions).values({
      factId,
      orgId: input.orgId,
      brandId: input.brandId,
      scope: input.scope,
      scopeId: input.scopeId,
      predicate: fact.predicate,
      object: fact.object,
      category: fact.category,
      confidence: fact.confidence,
      importance,
      source,
      sourceVersion,
      contentHash: hash,
      decision,
      reason,
      validFrom: now,
      expiresAt,
    });
  }

  return { factIds, upserted, rejected, conflicted };
}
