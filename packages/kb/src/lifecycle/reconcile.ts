import type { KeenaiDb } from "@keenai/storage";
import { kbChunks, kbDocuments, kbSupersessionProposals } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export const KEENI_KB_KB20 = {
  enabled: true,
  target: "kb.lifecycle.reconcile",
  notes: "KB-20: contradiction detect → supersession proposal (no auto overwrite).",
} as const;

export const KB_RECONCILE_OVERLAP_THRESHOLD = 0.45;

export type KbContradictionHit = {
  documentId: string;
  documentTitle: string;
  overlapScore: number;
  reason: string;
};

export type DetectKbContradictionsInput = {
  orgId: string;
  brandId: string;
  question: string;
  answer: string;
  overlapThreshold?: number;
};

export type ProposeKbSupersessionInput = {
  orgId: string;
  brandId: string;
  newDocumentId?: string;
  conflictsWithDocumentId: string;
  reason: string;
  metadata?: Record<string, unknown>;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/i)
      .filter((term) => term.length > 2),
  );
}

function overlapScore(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const term of left) {
    if (right.has(term)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

/** KB-20: lexical overlap against active FAQ chunks (stub contradiction detector). */
export async function detectKbContradictions(
  db: KeenaiDb,
  input: DetectKbContradictionsInput,
): Promise<KbContradictionHit[]> {
  const threshold = input.overlapThreshold ?? KB_RECONCILE_OVERLAP_THRESHOLD;
  const probe = `${input.question}\n${input.answer}`;

  const rows = await db
    .select({
      documentId: kbDocuments.id,
      documentTitle: kbDocuments.title,
      content: kbChunks.content,
    })
    .from(kbChunks)
    .innerJoin(kbDocuments, eq(kbChunks.documentId, kbDocuments.id))
    .where(
      and(
        eq(kbChunks.orgId, input.orgId),
        eq(kbChunks.brandId, input.brandId),
        eq(kbChunks.status, "active"),
        eq(kbDocuments.status, "active"),
      ),
    );

  const byDoc = new Map<string, { title: string; bodies: string[] }>();
  for (const row of rows) {
    const entry = byDoc.get(row.documentId) ?? { title: row.documentTitle, bodies: [] };
    entry.bodies.push(row.content);
    byDoc.set(row.documentId, entry);
  }

  const hits: KbContradictionHit[] = [];
  for (const [documentId, entry] of byDoc) {
    const combined = entry.bodies.join("\n");
    const score = overlapScore(probe, combined);
    if (score < threshold) continue;
    if (overlapScore(probe, combined) > 0.95) continue;
    hits.push({
      documentId,
      documentTitle: entry.title,
      overlapScore: score,
      reason: `topic_overlap:${score.toFixed(2)}`,
    });
  }

  return hits.sort((a, b) => b.overlapScore - a.overlapScore);
}

/** KB-20: persist supersession proposal for admin review. */
export async function proposeKbSupersession(
  db: KeenaiDb,
  input: ProposeKbSupersessionInput,
): Promise<{ proposalId: string }> {
  const [row] = await db
    .insert(kbSupersessionProposals)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      newDocumentId: input.newDocumentId,
      conflictsWithDocumentId: input.conflictsWithDocumentId,
      reason: input.reason,
      metadata: input.metadata ?? {},
    })
    .returning({ id: kbSupersessionProposals.id });

  if (!row?.id) throw new Error("kb_supersession_proposal_insert_failed");
  return { proposalId: row.id };
}
