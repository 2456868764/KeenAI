import type { KeenaiDb } from "@keenai/storage";
import type { KbSourceType } from "@keenai/storage/schema";
import { kbChunkVectors, kbChunks, kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type KbChunkFtsIndexer, indexKbChunkInFts } from "../chunk-fts-index.js";
import { computeKbChunkConfidence } from "../lifecycle/confidence.js";
import { getKbFreshnessHalfLifeDays } from "../lifecycle/freshness.js";
import { buildKbChunkProvenance } from "../lifecycle/provenance.js";
import { chunkKbDocument } from "./chunk-document.js";
import { hashKbChunkContent, planKbDocumentDiffIndex } from "./diff-index.js";
import { type KbChunkEmbedder, createStubKbChunkEmbedder, embedKbChunk } from "./embedder.js";
import { extractKbEntitiesFromDocument } from "./extract-kb-entities.js";
import { parseKbDocument } from "./parse-document.js";

export type IndexKbDocumentInput = {
  orgId: string;
  brandId: string;
  documentId: string;
  chunkFtsIndexer?: KbChunkFtsIndexer | null;
  chunkEmbedder?: KbChunkEmbedder;
  /** KB-17: preserve chunk ids when content unchanged. Defaults to true. */
  diffIndex?: boolean;
  /** KG-05: write kb_entities after index. Defaults to true. */
  extractEntities?: boolean;
};

export type IndexKbDocumentResult = {
  documentId: string;
  chunkCount: number;
  embedded: number;
  kept: number;
  removed: number;
  entityCount: number;
};

function readContentHash(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.contentHash;
  return typeof value === "string" ? value : null;
}

/** Run parse → chunk → embed and persist kb_chunks + kb_chunk_vectors. */
export async function indexKbDocument(
  db: KeenaiDb,
  input: IndexKbDocumentInput,
): Promise<IndexKbDocumentResult> {
  const [document] = await db
    .select()
    .from(kbDocuments)
    .where(
      and(
        eq(kbDocuments.id, input.documentId),
        eq(kbDocuments.orgId, input.orgId),
        eq(kbDocuments.brandId, input.brandId),
      ),
    )
    .limit(1);

  if (!document) {
    throw new Error("kb_document_not_found");
  }

  if (!document.rawContent) {
    throw new Error("kb_document_empty");
  }

  const [source] = document.sourceId
    ? await db.select().from(kbSources).where(eq(kbSources.id, document.sourceId)).limit(1)
    : [];

  const sourceType = (source?.type ?? "help_center") as KbSourceType;
  const halfLifeDays = getKbFreshnessHalfLifeDays(sourceType);

  const parsed = parseKbDocument({
    title: document.title,
    rawContent: document.rawContent,
    contentType: document.contentType,
  });
  const drafts = chunkKbDocument(parsed);
  const now = new Date();
  const useDiff = input.diffIndex !== false;

  const existing = await db
    .select({
      id: kbChunks.id,
      chunkIndex: kbChunks.chunkIndex,
      content: kbChunks.content,
      metadata: kbChunks.metadata,
      sectionId: kbChunks.sectionId,
    })
    .from(kbChunks)
    .where(and(eq(kbChunks.documentId, input.documentId), eq(kbChunks.status, "active")));

  const snapshots = existing.map((row) => ({
    id: row.id,
    chunkIndex: row.chunkIndex,
    contentHash: readContentHash(row.metadata) ?? hashKbChunkContent(row.content),
  }));

  const plan = useDiff
    ? planKbDocumentDiffIndex(snapshots, drafts)
    : {
        keep: [] as Array<{ id: string; draft: (typeof drafts)[number] }>,
        insert: drafts,
        removeIds: existing.map((row) => row.id),
      };

  if (plan.removeIds.length > 0) {
    await db.delete(kbChunkVectors).where(inArray(kbChunkVectors.chunkId, plan.removeIds));
    if (input.chunkFtsIndexer) {
      await input.chunkFtsIndexer.deleteByIds(plan.removeIds);
    }
    await db.delete(kbChunks).where(inArray(kbChunks.id, plan.removeIds));
  }

  const chunkIdsBySection = new Map<string, string[]>();
  let embedded = 0;

  const persistChunk = async (draft: (typeof drafts)[number], chunkId?: string) => {
    const provenance = buildKbChunkProvenance({
      sourceId: document.sourceId,
      sourceType,
      documentId: input.documentId,
      sourceUpdatedAt: document.sourceUpdatedAt,
    });
    const confidence = computeKbChunkConfidence({
      sourceType,
      sourceUpdatedAt: document.sourceUpdatedAt,
      provenance,
      halfLifeDays,
    });
    const contentHash = hashKbChunkContent(draft.content);

    let id = chunkId;
    if (id) {
      await db
        .update(kbChunks)
        .set({
          sectionId: draft.sectionId,
          content: draft.content,
          contextPrefix: draft.contextPrefix,
          contentSize: draft.content.length,
          provenance: provenance as unknown as Record<string, unknown>,
          confidence,
          metadata: { contentHash },
          status: "active",
          updatedAt: now,
        })
        .where(eq(kbChunks.id, id));
    } else {
      const [chunk] = await db
        .insert(kbChunks)
        .values({
          orgId: input.orgId,
          brandId: input.brandId,
          documentId: input.documentId,
          sectionId: draft.sectionId,
          chunkIndex: draft.chunkIndex,
          content: draft.content,
          contextPrefix: draft.contextPrefix,
          contentSize: draft.content.length,
          locale: document.canonicalLocale,
          provenance: provenance as unknown as Record<string, unknown>,
          confidence,
          metadata: { contentHash },
          status: "active",
          updatedAt: now,
        })
        .returning({ id: kbChunks.id });
      id = chunk?.id;
    }

    if (!id) return;

    const sectionKey = draft.sectionId ?? "body";
    const list = chunkIdsBySection.get(sectionKey) ?? [];
    list.push(id);
    chunkIdsBySection.set(sectionKey, list);

    const vector = await embedKbChunk(
      draft.content,
      input.chunkEmbedder ?? createStubKbChunkEmbedder(),
    );
    await db.delete(kbChunkVectors).where(eq(kbChunkVectors.chunkId, id));
    await db.insert(kbChunkVectors).values({
      chunkId: id,
      orgId: input.orgId,
      brandId: input.brandId,
      model: vector.model,
      dimensions: vector.dimensions,
      embeddingJson: JSON.stringify(vector.embedding),
      updatedAt: now,
    });

    if (input.chunkFtsIndexer) {
      await indexKbChunkInFts(input.chunkFtsIndexer, {
        chunkId: id,
        orgId: input.orgId,
        brandId: input.brandId,
        content: draft.content,
        contextPrefix: draft.contextPrefix,
      });
    }

    embedded += 1;
  };

  for (const kept of plan.keep) {
    await persistChunk(kept.draft, kept.id);
  }
  for (const draft of plan.insert) {
    await persistChunk(draft);
  }

  let entityCount = 0;
  if (input.extractEntities !== false) {
    const extracted = await extractKbEntitiesFromDocument(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      documentId: input.documentId,
      parsed,
      chunkIdsBySection,
    });
    entityCount = extracted.entityCount;
  }

  await db
    .update(kbDocuments)
    .set({ indexedAt: now, updatedAt: now })
    .where(eq(kbDocuments.id, input.documentId));

  if (document.sourceId) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(kbChunks)
      .innerJoin(kbDocuments, eq(kbChunks.documentId, kbDocuments.id))
      .where(
        and(
          eq(kbDocuments.sourceId, document.sourceId),
          eq(kbDocuments.status, "active"),
          eq(kbChunks.status, "active"),
        ),
      );

    await db
      .update(kbSources)
      .set({ chunkCount: countRow?.count ?? embedded, updatedAt: now })
      .where(eq(kbSources.id, document.sourceId));
  }

  return {
    documentId: input.documentId,
    chunkCount: plan.keep.length + plan.insert.length,
    embedded,
    kept: plan.keep.length,
    removed: plan.removeIds.length,
    entityCount,
  };
}
