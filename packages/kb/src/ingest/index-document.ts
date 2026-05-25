import type { KeenaiDb } from "@keenai/storage";
import { kbChunkVectors, kbChunks, kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { chunkKbDocument } from "./chunk-document.js";
import { embedKbChunkStub } from "./embed-chunks-stub.js";
import { parseKbDocument } from "./parse-document.js";

export type IndexKbDocumentInput = {
  orgId: string;
  brandId: string;
  documentId: string;
};

export type IndexKbDocumentResult = {
  documentId: string;
  chunkCount: number;
  embedded: number;
};

/** Run parse → chunk → embed stub and persist kb_chunks + kb_chunk_vectors. */
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

  const parsed = parseKbDocument({
    title: document.title,
    rawContent: document.rawContent,
    contentType: document.contentType,
  });
  const drafts = chunkKbDocument(parsed);
  const now = new Date();

  const existing = await db
    .select({ id: kbChunks.id })
    .from(kbChunks)
    .where(eq(kbChunks.documentId, input.documentId));
  const existingIds = existing.map((row) => row.id);

  if (existingIds.length > 0) {
    await db.delete(kbChunkVectors).where(inArray(kbChunkVectors.chunkId, existingIds));
  }
  await db.delete(kbChunks).where(eq(kbChunks.documentId, input.documentId));

  let embedded = 0;

  for (const draft of drafts) {
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
        updatedAt: now,
      })
      .returning({ id: kbChunks.id });

    const chunkId = chunk?.id;
    if (!chunkId) continue;

    const vector = embedKbChunkStub(draft.content);
    await db.insert(kbChunkVectors).values({
      chunkId,
      orgId: input.orgId,
      brandId: input.brandId,
      model: vector.model,
      dimensions: vector.dimensions,
      embeddingJson: JSON.stringify(vector.embedding),
      updatedAt: now,
    });
    embedded += 1;
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
      .where(and(eq(kbDocuments.sourceId, document.sourceId), eq(kbDocuments.status, "active")));

    await db
      .update(kbSources)
      .set({ chunkCount: countRow?.count ?? embedded, updatedAt: now })
      .where(eq(kbSources.id, document.sourceId));
  }

  return {
    documentId: input.documentId,
    chunkCount: drafts.length,
    embedded,
  };
}
