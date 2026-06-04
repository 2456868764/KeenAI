import type { KeenaiDb } from "@keenai/storage";
import { kbChunks, kbDocuments } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export const KEENI_KB_KB14 = {
  enabled: true,
  target: "kb.lifecycle.supersession",
  notes: "KB-14: document supersedes chain + chunk status active/superseded/archived.",
} as const;

export type KbDocumentSupersessionLink = {
  id: string;
  title: string;
  status: string;
  supersedesDocumentId: string | null;
  version: number;
};

export type SupersedeKbDocumentInput = {
  orgId: string;
  brandId: string;
  documentId: string;
  supersedesDocumentId: string;
};

/** Mark prior document + chunks superseded; new doc remains active (KB-14). */
export async function supersedeKbDocument(
  db: KeenaiDb,
  input: SupersedeKbDocumentInput,
): Promise<void> {
  const now = new Date();

  await db
    .update(kbDocuments)
    .set({ supersedesDocumentId: input.supersedesDocumentId, updatedAt: now })
    .where(
      and(
        eq(kbDocuments.id, input.documentId),
        eq(kbDocuments.orgId, input.orgId),
        eq(kbDocuments.brandId, input.brandId),
      ),
    );

  await db
    .update(kbDocuments)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(
        eq(kbDocuments.id, input.supersedesDocumentId),
        eq(kbDocuments.orgId, input.orgId),
        eq(kbDocuments.brandId, input.brandId),
      ),
    );

  await db
    .update(kbChunks)
    .set({ status: "superseded", updatedAt: now })
    .where(
      and(
        eq(kbChunks.documentId, input.supersedesDocumentId),
        eq(kbChunks.orgId, input.orgId),
        eq(kbChunks.brandId, input.brandId),
      ),
    );
}

/** Walk supersession chain from a document id (newest-first). */
export async function listKbDocumentSupersessionChain(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; documentId: string },
): Promise<KbDocumentSupersessionLink[]> {
  const chain: KbDocumentSupersessionLink[] = [];
  let currentId: string | null = input.documentId;

  while (currentId) {
    const [doc] = await db
      .select({
        id: kbDocuments.id,
        title: kbDocuments.title,
        status: kbDocuments.status,
        supersedesDocumentId: kbDocuments.supersedesDocumentId,
        version: kbDocuments.version,
      })
      .from(kbDocuments)
      .where(
        and(
          eq(kbDocuments.id, currentId),
          eq(kbDocuments.orgId, input.orgId),
          eq(kbDocuments.brandId, input.brandId),
        ),
      )
      .limit(1);

    if (!doc) break;
    chain.push(doc);
    currentId = doc.supersedesDocumentId;
  }

  return chain;
}
