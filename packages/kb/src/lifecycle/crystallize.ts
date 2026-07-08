import type { KeenaiDb } from "@keenai/storage";
import { kbCandidates, kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { parseKbBrandSchema, resolveKbQualityGates } from "../schema/brand-kb-schema.js";
import { extractKbCrystallizeFaq } from "./crystallize-extract.js";
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
  qualityReasons?: string[];
  extractSource?: "heuristic" | "llm";
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
  requestedGate?: KbCrystallizeGate;
  extract: KbCrystallizeExtract;
  candidateId?: string;
  documentId?: string;
  proposalIds: string[];
};

export type KbCrystallizeQualityAssessment = {
  score: number;
  reasons: string[];
  signals: {
    csat: number;
    answerCompleteness: number;
    questionSpecificity: number;
    entityCoverage: number;
    sourceConfidence: number;
    penalty: number;
  };
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function uniqueTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/i)
      .filter((term) => term.length > 2),
  );
}

function scoreQuestionSpecificity(question: string | undefined): number {
  const normalized = question?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized) return 0.7;
  const terms = uniqueTerms(normalized);
  const lengthScore = clamp01(normalized.length / 80);
  const termScore = clamp01(terms.size / 8);
  const intentBoost = /[?？]|\b(how|what|when|where|why|can|do|does|is|are)\b/i.test(normalized)
    ? 0.12
    : 0;
  return clamp01(lengthScore * 0.45 + termScore * 0.45 + intentBoost);
}

function scoreAnswerCompleteness(answer: string): number {
  const normalized = answer.trim().replace(/\s+/g, " ");
  if (!normalized) return 0;
  const terms = uniqueTerms(normalized);
  const lengthScore = clamp01(normalized.length / 220);
  const termScore = clamp01(terms.size / 18);
  const structureBoost =
    /(?:\b(first|then|next|finally|step|click|open|select)\b|[。.!]\s+\S)/i.test(normalized)
      ? 0.08
      : 0;
  return clamp01(lengthScore * 0.5 + termScore * 0.42 + structureBoost);
}

function scoreEntityCoverage(entities: string[] | undefined): number {
  if (!entities) return 0.6;
  return clamp01(new Set(entities.map((entity) => entity.trim()).filter(Boolean)).size / 4);
}

function answerRiskPenalty(answer: string): { penalty: number; reasons: string[] } {
  const normalized = answer.trim();
  const reasons: string[] = [];
  let penalty = 0;

  if (normalized.length < 24) {
    penalty += 0.12;
    reasons.push("answer_too_short");
  }
  if (
    /\b(i don't know|not sure|maybe|probably|it depends|check the docs|contact support|ask support)\b/i.test(
      normalized,
    ) ||
    /(?:不确定|可能|联系(?:客服|支持)|查看文档)/.test(normalized)
  ) {
    penalty += 0.18;
    reasons.push("answer_uncertain_or_escalates");
  }
  if (!/[.!?。！？]/.test(normalized)) {
    penalty += 0.04;
    reasons.push("answer_missing_sentence_boundary");
  }

  return { penalty: clamp01(penalty), reasons };
}

/** KB-19 quality assessment from CSAT, FAQ completeness, entity coverage, and weak-answer signals. */
export function assessKbCrystallizeQuality(input: {
  csatScore: number;
  question?: string;
  answer: string;
  entities?: string[];
  extractSource?: "heuristic" | "llm";
}): KbCrystallizeQualityAssessment {
  const csat = clamp01(Math.min(Math.max(input.csatScore, 1), 5) / 5);
  const answerCompleteness = scoreAnswerCompleteness(input.answer);
  const questionSpecificity = scoreQuestionSpecificity(input.question);
  const entityCoverage = scoreEntityCoverage(input.entities);
  const sourceConfidence = input.extractSource === "llm" ? 0.85 : 0.65;
  const risk = answerRiskPenalty(input.answer);
  const score = clamp01(
    csat * 0.38 +
      answerCompleteness * 0.28 +
      questionSpecificity * 0.14 +
      entityCoverage * 0.1 +
      sourceConfidence * 0.1 -
      risk.penalty,
  );
  const reasons = [...risk.reasons];
  if (answerCompleteness < 0.35) reasons.push("answer_low_completeness");
  if (questionSpecificity < 0.35) reasons.push("question_low_specificity");
  if (entityCoverage < 0.25) reasons.push("entity_low_coverage");

  return {
    score,
    reasons,
    signals: {
      csat,
      answerCompleteness,
      questionSpecificity,
      entityCoverage,
      sourceConfidence,
      penalty: risk.penalty,
    },
  };
}

export function scoreKbCrystallizeQuality(input: {
  csatScore: number;
  question?: string;
  answer: string;
  entities?: string[];
  extractSource?: "heuristic" | "llm";
}): number {
  return assessKbCrystallizeQuality(input).score;
}

export function gateKbCrystallizeQuality(
  qualityScore: number,
  gates: { autoMin: number; candidateMin: number },
): KbCrystallizeGate {
  if (qualityScore >= gates.autoMin) return "auto_index";
  if (qualityScore >= gates.candidateMin) return "candidate";
  return "memory_only";
}

function resolveCrystallizeGateForReview(
  gate: KbCrystallizeGate,
  proposalIds: string[],
): KbCrystallizeGate {
  if (gate === "auto_index" && proposalIds.length > 0) return "candidate";
  return gate;
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

  const faq = await extractKbCrystallizeFaq({
    question: input.question,
    answer: input.answer,
    csatScore: input.csatScore,
  });

  const quality = assessKbCrystallizeQuality({
    csatScore: input.csatScore,
    question: faq.question,
    answer: faq.answer,
    entities: input.entities?.length ? input.entities : faq.entities,
    extractSource: faq.source,
  });

  const extract: KbCrystallizeExtract = {
    question: faq.question,
    answer: faq.answer,
    entities: input.entities?.length ? input.entities : faq.entities,
    qualityScore: quality.score,
    qualityReasons: quality.reasons,
    extractSource: faq.source,
  };

  const requestedGate = gateKbCrystallizeQuality(extract.qualityScore, gates);
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

  const gate = resolveCrystallizeGateForReview(requestedGate, proposalIds);

  if (gate === "memory_only") {
    return { gate, requestedGate, extract, proposalIds };
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
        metadata: {
          proposalIds,
          requestedGate,
          qualityReasons: extract.qualityReasons ?? [],
          qualitySignals: quality.signals,
        },
      })
      .returning({ id: kbCandidates.id });
    return {
      gate,
      requestedGate,
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
      metadata: {
        crystallizedFrom: input.conversationId,
        qualityScore: extract.qualityScore,
        extractSource: extract.extractSource ?? "heuristic",
        qualityReasons: extract.qualityReasons ?? [],
        qualitySignals: quality.signals,
      },
    })
    .returning({ id: kbDocuments.id });

  return {
    gate,
    requestedGate,
    extract,
    documentId: doc?.id,
    proposalIds,
  };
}
