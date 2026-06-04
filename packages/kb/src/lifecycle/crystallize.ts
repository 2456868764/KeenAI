import type { KeenaiDb } from "@keenai/storage";
import { kbCandidates, kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { parseKbBrandSchema, resolveKbQualityGates } from "../schema/brand-kb-schema.js";
import { detectKbContradictions, proposeKbSupersession } from "./reconcile.js";

export const KEENI_KB_KB19 = {
  enabled: true,
  target: "kb.lifecycle.crystallize",
  notes: "KB-19: conversation/closed + CSAT≥4 → FAQ extract → reconcile → index/candidate.",
} as const;

export const KB_CRYSTALLIZE_MIN_CSAT = 4;

export type KbCrystallizeExtract = {
  question: string;
  answer: string;
  entities: string[];
  qualityScore: number;
};

export type KbCrystallizeGate = "auto_index" | "candidate" | "memory_only";

export type KbCrystallizeInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  csatScore: number;
  question: string;
  answer: string;
  entities?: string[];
};

export type KbCrystallizeResult = {
  gate: KbCrystallizeGate;
  extract: KbCrystallizeExtract;
  candidateId?: string;
  documentId?: string;
  proposalIds: string[];
};

/** Stub quality score from CSAT + answer length heuristics. */
export function scoreKbCrystallizeQuality(input: {
  csatScore: number;
  answer: string;
}): number {
  const lengthBoost = Math.min(input.answer.trim().length / 500, 0.15);
  const csatNorm = Math.min(Math.max(input.csatScore, 1), 5) / 5;
  return Math.min(1, csatNorm * 0.85 + lengthBoost);
}

export function gateKbCrystallizeQuality(
  qualityScore: number,
  gates: { autoMin: number; candidateMin: number },
): KbCrystallizeGate {
  if (qualityScore >= gates.autoMin) return "auto_index";
  if (qualityScore >= gates.candidateMin) return "candidate";
  return "memory_only";
}

/** KB-19 crystallization pipeline (extract → reconcile → crystallize). */
export async function runKbCrystallization(
  db: KeenaiDb,
  input: KbCrystallizeInput,
): Promise<KbCrystallizeResult> {
  if (input.csatScore < KB_CRYSTALLIZE_MIN_CSAT) {
    throw new Error("kb_crystallize_csat_too_low");
  }

  const sources = await db
    .select({ id: kbSources.id, config: kbSources.config, type: kbSources.type })
    .from(kbSources)
    .where(and(eq(kbSources.orgId, input.orgId), eq(kbSources.brandId, input.brandId)));

  const source = sources.find((row) => row.type === "resolved_conversations") ?? sources[0] ?? null;
  if (!source) throw new Error("kb_source_missing");

  const brandSchema = parseKbBrandSchema(source.config ?? {});
  const gates = resolveKbQualityGates(brandSchema);

  const extract: KbCrystallizeExtract = {
    question: input.question.trim(),
    answer: input.answer.trim(),
    entities: input.entities ?? [],
    qualityScore: scoreKbCrystallizeQuality({
      csatScore: input.csatScore,
      answer: input.answer,
    }),
  };

  const gate = gateKbCrystallizeQuality(extract.qualityScore, gates);
  const contradictions = await detectKbContradictions(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    question: extract.question,
    answer: extract.answer,
  });

  const proposalIds: string[] = [];
  for (const hit of contradictions.slice(0, 3)) {
    const { proposalId } = await proposeKbSupersession(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      conflictsWithDocumentId: hit.documentId,
      reason: hit.reason,
      metadata: { overlapScore: hit.overlapScore },
    });
    proposalIds.push(proposalId);
  }

  if (gate === "memory_only") {
    return { gate, extract, proposalIds };
  }

  if (gate === "candidate") {
    const [row] = await db
      .insert(kbCandidates)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        conversationId: input.conversationId,
        question: extract.question,
        answer: extract.answer,
        qualityScore: extract.qualityScore,
        entities: extract.entities,
        status: "pending",
        metadata: { proposalIds },
      })
      .returning({ id: kbCandidates.id });
    return {
      gate,
      extract,
      candidateId: row?.id,
      proposalIds,
    };
  }

  const title = extract.question.slice(0, 120);
  const [doc] = await db
    .insert(kbDocuments)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      sourceId: source.id,
      title,
      rawContent: `# ${title}\n\n${extract.answer}`,
      contentType: "text/markdown",
      status: "active",
      metadata: { crystallizedFrom: input.conversationId, qualityScore: extract.qualityScore },
    })
    .returning({ id: kbDocuments.id });

  return {
    gate,
    extract,
    documentId: doc?.id,
    proposalIds,
  };
}
