import { createHash } from "node:crypto";
import type { KeenaiDb } from "@keenai/storage";
import { kbChunkVectors, kbChunks, kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { SyncKbSourceInput, SyncKbSourceResult } from "./connectors/types.js";

function contentHash(rawContent: string): string {
  return createHash("sha256").update(rawContent).digest("hex");
}

/** Pull documents from a connector and upsert into kb_documents (stub sync). */
export async function syncKbSource(
  db: KeenaiDb,
  input: SyncKbSourceInput,
): Promise<SyncKbSourceResult> {
  const [source] = await db
    .select({ id: kbSources.id, type: kbSources.type })
    .from(kbSources)
    .where(
      and(
        eq(kbSources.id, input.sourceId),
        eq(kbSources.orgId, input.orgId),
        eq(kbSources.brandId, input.brandId),
      ),
    )
    .limit(1);

  if (!source) {
    throw new Error("kb_source_not_found");
  }

  if (source.type !== input.connector.type) {
    throw new Error("kb_connector_type_mismatch");
  }

  const refs = await input.connector.list({ since: input.since });
  const now = new Date();
  let synced = 0;
  let skipped = 0;

  for (const ref of refs) {
    const fetched = await input.connector.fetch(ref);
    const hash = contentHash(fetched.rawContent);

    await db
      .insert(kbDocuments)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        sourceId: input.sourceId,
        externalId: fetched.externalId,
        title: fetched.title,
        url: fetched.url,
        rawContent: fetched.rawContent,
        contentType: fetched.contentType,
        canonicalLocale: fetched.canonicalLocale,
        permissions: fetched.permissions ?? {},
        metadata: fetched.attachments ? { attachments: fetched.attachments } : {},
        contentHash: hash,
        sourceUpdatedAt: new Date(fetched.updatedAt),
        indexedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [kbDocuments.sourceId, kbDocuments.externalId],
        set: {
          title: fetched.title,
          url: fetched.url,
          rawContent: fetched.rawContent,
          contentType: fetched.contentType,
          canonicalLocale: fetched.canonicalLocale,
          permissions: fetched.permissions ?? {},
          metadata: fetched.attachments ? { attachments: fetched.attachments } : {},
          contentHash: hash,
          sourceUpdatedAt: new Date(fetched.updatedAt),
          indexedAt: now,
          updatedAt: now,
        },
      });

    synced += 1;
  }

  if (!input.since && refs.length > 0) {
    const currentExternalIds = refs.map((ref) => ref.externalId);
    const staleDocuments = await db
      .select({ id: kbDocuments.id })
      .from(kbDocuments)
      .where(
        and(
          eq(kbDocuments.sourceId, input.sourceId),
          eq(kbDocuments.status, "active"),
          notInArray(kbDocuments.externalId, currentExternalIds),
        ),
      );
    const staleDocumentIds = staleDocuments.map((document) => document.id);

    if (staleDocumentIds.length > 0) {
      const staleChunks = await db
        .select({ id: kbChunks.id })
        .from(kbChunks)
        .where(and(inArray(kbChunks.documentId, staleDocumentIds), eq(kbChunks.status, "active")));
      const staleChunkIds = staleChunks.map((chunk) => chunk.id);

      if (staleChunkIds.length > 0) {
        await db.delete(kbChunkVectors).where(inArray(kbChunkVectors.chunkId, staleChunkIds));
        await db
          .update(kbChunks)
          .set({ status: "archived", updatedAt: now })
          .where(inArray(kbChunks.id, staleChunkIds));
      }

      await db
        .update(kbDocuments)
        .set({ status: "archived", updatedAt: now })
        .where(inArray(kbDocuments.id, staleDocumentIds));
      skipped += staleDocumentIds.length;
    }
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(kbDocuments)
    .where(and(eq(kbDocuments.sourceId, input.sourceId), eq(kbDocuments.status, "active")));

  await db
    .update(kbSources)
    .set({
      documentCount: countRow?.count ?? synced,
      lastSyncedAt: now,
      updatedAt: now,
      status: "active",
      error: null,
    })
    .where(eq(kbSources.id, input.sourceId));

  return { listed: refs.length, synced, skipped };
}
