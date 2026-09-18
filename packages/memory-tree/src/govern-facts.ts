import { createHash } from "node:crypto";
import type { KeenaiDb } from "@keenai/storage";
import { memoryFactVersions, memoryFacts } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

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

function hashFact(predicate: string, object: unknown): string {
  return createHash("sha256")
    .update(`${predicate}\n${stableJson(object)}`)
    .digest("hex");
}

async function loadFact(db: KeenaiDb, orgId: string, factId: string) {
  const [fact] = await db
    .select()
    .from(memoryFacts)
    .where(and(eq(memoryFacts.id, factId), eq(memoryFacts.orgId, orgId)))
    .limit(1);
  return fact ?? null;
}

export async function correctMemoryFact(
  db: KeenaiDb,
  input: {
    orgId: string;
    factId: string;
    actorId: string;
    reason: string;
    object?: unknown;
    confidence?: number;
    importance?: number;
    expiresAt?: Date | null;
  },
) {
  const fact = await loadFact(db, input.orgId, input.factId);
  if (!fact) return null;
  const now = new Date();
  const object = input.object === undefined ? fact.object : input.object;
  const confidence = input.confidence ?? fact.confidence;
  const importance = input.importance ?? fact.importance;
  const expiresAt = input.expiresAt === undefined ? fact.expiresAt : input.expiresAt;
  const contentHash = hashFact(fact.predicate, object);
  const sourceVersion = `manual:${now.toISOString()}`;

  const [updated] = await db
    .update(memoryFacts)
    .set({
      object,
      confidence,
      importance,
      expiresAt,
      contentHash,
      source: `manual:${input.actorId}`,
      sourceVersion,
      status: "active",
      archivedAt: null,
      updatedAt: now,
    })
    .where(eq(memoryFacts.id, fact.id))
    .returning();

  await db.insert(memoryFactVersions).values({
    factId: fact.id,
    orgId: fact.orgId,
    brandId: fact.brandId,
    scope: fact.scope,
    scopeId: fact.scopeId,
    predicate: fact.predicate,
    object,
    category: fact.category,
    confidence,
    importance,
    source: `manual:${input.actorId}`,
    sourceVersion,
    contentHash,
    decision: "corrected",
    reason: input.reason,
    validFrom: now,
    expiresAt,
    reviewedBy: input.actorId,
    reviewedAt: now,
  });
  return updated ?? null;
}

export async function archiveMemoryFact(
  db: KeenaiDb,
  input: { orgId: string; factId: string; actorId: string; reason: string },
) {
  const fact = await loadFact(db, input.orgId, input.factId);
  if (!fact) return null;
  const now = new Date();
  const contentHash = fact.contentHash ?? hashFact(fact.predicate, fact.object);
  const [updated] = await db
    .update(memoryFacts)
    .set({ status: "deleted", archivedAt: now, updatedAt: now })
    .where(eq(memoryFacts.id, fact.id))
    .returning();

  await db.insert(memoryFactVersions).values({
    factId: fact.id,
    orgId: fact.orgId,
    brandId: fact.brandId,
    scope: fact.scope,
    scopeId: fact.scopeId,
    predicate: fact.predicate,
    object: fact.object,
    category: fact.category,
    confidence: fact.confidence,
    importance: fact.importance,
    source: `manual:${input.actorId}`,
    sourceVersion: `manual:${now.toISOString()}`,
    contentHash,
    decision: "deleted",
    reason: input.reason,
    validFrom: now,
    expiresAt: fact.expiresAt,
    reviewedBy: input.actorId,
    reviewedAt: now,
  });
  return updated ?? null;
}
