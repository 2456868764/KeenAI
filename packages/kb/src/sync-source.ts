import { createHash } from "node:crypto";
import type { KeenaiDb } from "@keenai/storage";
import { kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq, sql } from "drizzle-orm";
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
  const skipped = 0;

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
          contentHash: hash,
          sourceUpdatedAt: new Date(fetched.updatedAt),
          indexedAt: now,
          updatedAt: now,
        },
      });

    synced += 1;
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
