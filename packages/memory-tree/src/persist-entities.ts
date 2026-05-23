import type { KeenaiDb } from "@keenai/storage";
import { memoryEntities } from "@keenai/storage/schema";
import { sql } from "drizzle-orm";
import type { ExtractedMemoryEntity } from "./stub-entity-extractor.js";

export type PersistMemoryEntitiesInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  summaryId: string;
  entities: ExtractedMemoryEntity[];
};

/** Upsert extracted entities keyed by org + scope + type + name. */
export async function persistMemoryEntities(
  db: KeenaiDb,
  input: PersistMemoryEntitiesInput,
): Promise<{ entityIds: string[]; upserted: number }> {
  const now = new Date();
  const entityIds: string[] = [];
  let upserted = 0;

  for (const entity of input.entities) {
    const rows = await db
      .insert(memoryEntities)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        scope: input.scope,
        scopeId: input.scopeId,
        entityType: entity.entityType,
        name: entity.name,
        aliases: entity.aliases ?? [],
        attributes: entity.attributes ?? {},
        mentionCount: 1,
        summaryId: input.summaryId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          memoryEntities.orgId,
          memoryEntities.scope,
          memoryEntities.scopeId,
          memoryEntities.entityType,
          memoryEntities.name,
        ],
        set: {
          aliases: entity.aliases ?? [],
          attributes: entity.attributes ?? {},
          mentionCount: sql`${memoryEntities.mentionCount} + 1`,
          summaryId: input.summaryId,
          updatedAt: now,
        },
      })
      .returning({ id: memoryEntities.id });

    const row = rows[0];
    if (row) {
      entityIds.push(row.id);
      upserted += 1;
    }
  }

  return { entityIds, upserted };
}
