import type { KeenaiDb } from "@keenai/storage";
import { memoryEntities } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

export type RelatedTopicHit = {
  entityId: string;
  relationType: string;
  depth: number;
};

export type QueryRelatedTopicsInput = {
  orgId: string;
  entityId: string;
  maxDepth?: number;
  relationTypes?: string[];
};

const DEFAULT_RELATION_TYPES = ["concerns", "requested", "questioned"] as const;

/** Walk outgoing relations from an entity using a recursive CTE. */
export async function queryRelatedTopics(
  db: KeenaiDb,
  input: QueryRelatedTopicsInput,
): Promise<RelatedTopicHit[]> {
  const maxDepth = input.maxDepth ?? 3;
  const relationTypes = input.relationTypes ?? [...DEFAULT_RELATION_TYPES];
  const typeList = sql.join(
    relationTypes.map((type) => sql`${type}`),
    sql`, `,
  );

  const rows = await db.all<{ entity_id: string; relation_type: string; depth: number }>(sql`
    WITH RECURSIVE related AS (
      SELECT to_entity_id AS entity_id, relation_type, 1 AS depth
      FROM memory_relations
      WHERE org_id = ${input.orgId}
        AND from_entity_id = ${input.entityId}
        AND relation_type IN (${typeList})

      UNION

      SELECT mr.to_entity_id, mr.relation_type, r.depth + 1
      FROM memory_relations mr
      INNER JOIN related r ON mr.from_entity_id = r.entity_id
      WHERE mr.org_id = ${input.orgId}
        AND r.depth < ${maxDepth}
        AND mr.relation_type IN (${typeList})
    )
    SELECT entity_id, relation_type, depth FROM related
  `);

  return rows.map((row) => ({
    entityId: row.entity_id,
    relationType: row.relation_type,
    depth: row.depth,
  }));
}

export type GraphRelatedNode = {
  entityId: string;
  entityType: string;
  name: string;
  relationType: string;
  depth: number;
};

export type QueryGraphRelatedInput = {
  orgId: string;
  brandId: string;
  entityId: string;
  maxDepth?: number;
};

export type QueryGraphRelatedResult = {
  rootEntityId: string;
  related: GraphRelatedNode[];
  reason?: "entity_not_found";
};

/** Resolve related graph nodes with entity metadata for API responses. */
export async function queryGraphRelated(
  db: KeenaiDb,
  input: QueryGraphRelatedInput,
): Promise<QueryGraphRelatedResult> {
  const [root] = await db
    .select({ id: memoryEntities.id })
    .from(memoryEntities)
    .where(
      and(
        eq(memoryEntities.id, input.entityId),
        eq(memoryEntities.orgId, input.orgId),
        eq(memoryEntities.brandId, input.brandId),
      ),
    )
    .limit(1);

  if (!root) {
    return { rootEntityId: input.entityId, related: [], reason: "entity_not_found" };
  }

  const hits = await queryRelatedTopics(db, {
    orgId: input.orgId,
    entityId: input.entityId,
    maxDepth: input.maxDepth,
  });

  if (hits.length === 0) {
    return { rootEntityId: root.id, related: [] };
  }

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
        inArray(
          memoryEntities.id,
          hits.map((hit) => hit.entityId),
        ),
      ),
    );

  const byId = new Map(entityRows.map((row) => [row.id, row]));

  return {
    rootEntityId: root.id,
    related: hits.map((hit) => {
      const entity = byId.get(hit.entityId);
      return {
        entityId: hit.entityId,
        entityType: entity?.entityType ?? "unknown",
        name: entity?.name ?? "unknown",
        relationType: hit.relationType,
        depth: hit.depth,
      };
    }),
  };
}
