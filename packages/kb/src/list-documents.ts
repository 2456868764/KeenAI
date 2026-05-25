import type { KeenaiDb } from "@keenai/storage";
import { kbDocuments } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import type { KbDocumentView, ListKbDocumentsInput } from "./types.js";

/** List KB documents for a brand, newest first. */
export async function listKbDocuments(
  db: KeenaiDb,
  input: ListKbDocumentsInput,
): Promise<KbDocumentView[]> {
  const status = input.status ?? "active";
  const limit = input.limit ?? 50;

  const rows = await db
    .select({
      id: kbDocuments.id,
      sourceId: kbDocuments.sourceId,
      title: kbDocuments.title,
      url: kbDocuments.url,
      status: kbDocuments.status,
      canonicalLocale: kbDocuments.canonicalLocale,
      version: kbDocuments.version,
      indexedAt: kbDocuments.indexedAt,
      updatedAt: kbDocuments.updatedAt,
    })
    .from(kbDocuments)
    .where(
      and(
        eq(kbDocuments.orgId, input.orgId),
        eq(kbDocuments.brandId, input.brandId),
        eq(kbDocuments.status, status),
      ),
    )
    .orderBy(desc(kbDocuments.updatedAt))
    .limit(limit);

  return rows;
}
