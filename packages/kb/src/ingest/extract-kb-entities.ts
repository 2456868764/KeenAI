import type { KeenaiDb } from "@keenai/storage";
import { kbEntities, kbRelations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { ParsedKbDocument } from "./parse-document.js";

export const KEENI_KB_KG05 = {
  enabled: true,
  target: "kb.ingest.extract_entities",
  notes: "KG-05 stub: heading/title entities + documented_in relations for graph-expand.",
} as const;

export type ExtractKbEntitiesInput = {
  orgId: string;
  brandId: string;
  documentId: string;
  parsed: ParsedKbDocument;
  chunkIdsBySection: Map<string, string[]>;
};

export type ExtractKbEntitiesResult = {
  entityCount: number;
  relationCount: number;
};

function normalizeEntityName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** KG-05 stub extractor: title + section headings → kb_entities / documented_in. */
export async function extractKbEntitiesFromDocument(
  db: KeenaiDb,
  input: ExtractKbEntitiesInput,
): Promise<ExtractKbEntitiesResult> {
  const now = new Date();
  let entityCount = 0;
  let relationCount = 0;

  const upsertEntity = async (name: string, chunkIds: string[]) => {
    const normalized = normalizeEntityName(name);
    if (!normalized) return null;

    const [existing] = await db
      .select({ id: kbEntities.id, chunkIds: kbEntities.chunkIds })
      .from(kbEntities)
      .where(
        and(
          eq(kbEntities.orgId, input.orgId),
          eq(kbEntities.brandId, input.brandId),
          eq(kbEntities.entityType, "topic"),
          eq(kbEntities.name, normalized),
        ),
      )
      .limit(1);

    if (existing) {
      const merged = [...new Set([...(existing.chunkIds ?? []), ...chunkIds])];
      await db
        .update(kbEntities)
        .set({ chunkIds: merged, updatedAt: now })
        .where(eq(kbEntities.id, existing.id));
      return existing.id;
    }

    const [created] = await db
      .insert(kbEntities)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        entityType: "topic",
        name: normalized,
        aliases: [],
        chunkIds,
        updatedAt: now,
      })
      .returning({ id: kbEntities.id });

    entityCount += 1;
    return created?.id ?? null;
  };

  const docChunkIds = [...input.chunkIdsBySection.values()].flat();
  const docEntityId = await upsertEntity(input.parsed.title, docChunkIds);

  for (const section of input.parsed.sections) {
    const chunkIds = input.chunkIdsBySection.get(section.id) ?? [];
    if (chunkIds.length === 0) continue;

    const sectionEntityId = await upsertEntity(section.heading, chunkIds);
    if (!sectionEntityId || !docEntityId) continue;

    const [relation] = await db
      .insert(kbRelations)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        fromEntityId: sectionEntityId,
        relationType: "documented_in",
        toEntityId: docEntityId,
        evidenceChunkIds: chunkIds,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: kbRelations.id });

    if (relation?.id) relationCount += 1;
  }

  return { entityCount, relationCount };
}
