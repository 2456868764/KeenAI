import type { KeenaiDb } from "@keenai/storage";
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
