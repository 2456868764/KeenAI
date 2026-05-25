import type { KeenaiDb } from "@keenai/storage";
import { memoryEntities, memoryRelations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { ExtractedMemoryRelation } from "./stub-relation-extractor.js";

export type PersistMemoryRelationsInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  summaryId: string;
  relations: ExtractedMemoryRelation[];
};

function entityKey(entityType: string | undefined, name: string): string {
  return `${entityType ?? "*"}:${name.toLowerCase()}`;
}

/** Upsert extracted relations keyed by org + from + type + to. */
export async function persistMemoryRelations(
  db: KeenaiDb,
  input: PersistMemoryRelationsInput,
): Promise<{ relationIds: string[]; upserted: number }> {
  const entityRows = await db
    .select({
      id: memoryEntities.id,
      entityType: memoryEntities.entityType,
      name: memoryEntities.name,
    })
    .from(memoryEntities)
    .where(
      and(
        eq(memoryEntities.orgId, input.orgId),
        eq(memoryEntities.scope, input.scope),
        eq(memoryEntities.scopeId, input.scopeId),
      ),
    );

  const byKey = new Map<string, string>();
  for (const row of entityRows) {
    byKey.set(entityKey(row.entityType, row.name), row.id);
    byKey.set(entityKey(undefined, row.name), row.id);
  }

  const now = new Date();
  const relationIds: string[] = [];
  let upserted = 0;

  for (const relation of input.relations) {
    const fromId =
      byKey.get(entityKey(relation.fromType, relation.fromName)) ??
      byKey.get(entityKey(undefined, relation.fromName));
    const toId =
      byKey.get(entityKey(relation.toType, relation.toName)) ??
      byKey.get(entityKey(undefined, relation.toName));

    if (!fromId || !toId) continue;

    const rows = await db
      .insert(memoryRelations)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        fromEntityId: fromId,
        relationType: relation.relationType,
        toEntityId: toId,
        confidence: relation.confidence,
        evidence: [input.summaryId],
        summaryId: input.summaryId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          memoryRelations.orgId,
          memoryRelations.fromEntityId,
          memoryRelations.relationType,
          memoryRelations.toEntityId,
        ],
        set: {
          confidence: relation.confidence,
          evidence: [input.summaryId],
          summaryId: input.summaryId,
          updatedAt: now,
        },
      })
      .returning({ id: memoryRelations.id });

    const row = rows[0];
    if (row) {
      relationIds.push(row.id);
      upserted += 1;
    }
  }

  return { relationIds, upserted };
}
