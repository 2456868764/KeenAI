import type { KeenaiDb } from "@keenai/storage";
import { kbChunks, kbDocuments, kbSupersessionProposals } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export const KEENI_KB_KB20 = {
  enabled: true,
  target: "kb.lifecycle.reconcile",
  notes: "KB-20: signal-based contradiction detect → supersession proposal (no auto overwrite).",
} as const;

export const KB_RECONCILE_OVERLAP_THRESHOLD = 0.45;
export const KB_RECONCILE_SIGNAL_THRESHOLD = 0.7;

export type KbContradictionHit = {
  documentId: string;
  documentTitle: string;
  overlapScore: number;
  contradictionScore: number;
  reason: string;
};

export type DetectKbContradictionsInput = {
  orgId: string;
  brandId: string;
  question: string;
  answer: string;
  overlapThreshold?: number;
  signalThreshold?: number;
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
      .map(normalizeToken)
      .filter((term) => term.length > 2),
  );
}

function normalizeToken(term: string): string {
  const lower = term.toLowerCase();
  const singular = lower.endsWith("s") && lower.length > 4 ? lower.slice(0, -1) : lower;
  const synonyms: Record<string, string> = {
    invoices: "invoice",
    receipts: "invoice",
    refunding: "refund",
    refunded: "refund",
    refundable: "refund",
    reimburse: "refund",
    reimbursement: "refund",
    cancel: "cancellation",
    cancelled: "cancellation",
    canceled: "cancellation",
    export: "export",
    download: "export",
    下载: "export",
    导出: "export",
    退款: "refund",
    发票: "invoice",
    账单: "billing",
    取消: "cancellation",
  };
  return synonyms[singular] ?? singular;
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

type PolicySignals = {
  topics: Set<string>;
  refundAllowed?: boolean;
  dayWindows: number[];
  channels: Set<string>;
};

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["refund", /\brefund|reimburse|退款/i],
  ["invoice", /\binvoice|receipt|发票/i],
  ["billing", /\bbilling|账单/i],
  ["export", /\bexport|download|导出|下载/i],
  ["cancellation", /\bcancell?ation|cancel|取消/i],
  ["login", /\blog[ -]?in|sign[ -]?in|登录/i],
];

const CHANNEL_PATTERNS: Array<[string, RegExp]> = [
  ["dashboard", /\bdashboard|console|后台|控制台/i],
  ["email", /\bemail|mail|邮件/i],
  ["support", /\bsupport|agent|客服/i],
  ["api", /\bapi\b/i],
];

function extractPolicySignals(text: string): PolicySignals {
  const normalized = text.toLowerCase();
  const topics = new Set<string>();
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(text)) topics.add(topic);
  }

  const channels = new Set<string>();
  for (const [channel, pattern] of CHANNEL_PATTERNS) {
    if (pattern.test(text)) channels.add(channel);
  }

  const dayWindows = [...text.matchAll(/(\d{1,4})\s*(?:day|days|天|日)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);

  let refundAllowed: boolean | undefined;
  if (
    /\b(no|not|never|cannot|can't|cant|non-refundable|ineligible)\b[^.。]{0,40}\brefund/i.test(
      normalized,
    ) ||
    /\brefund\b[^.。]{0,60}\b(no|not|never|cannot|can't|cant|unavailable|ineligible)\b/i.test(
      normalized,
    ) ||
    /不(?:支持|允许|可|能).{0,12}退款|无法.{0,12}退款/.test(text)
  ) {
    refundAllowed = false;
  } else if (
    /\b(can|eligible|available|allow|allowed|support|supports|within)\b[^.。]{0,60}\brefund/i.test(
      normalized,
    ) ||
    /\brefund\b[^.。]{0,60}\b(can|eligible|available|allow|allowed|support|supports|within)\b/i.test(
      normalized,
    ) ||
    /(?:支持|可以|允许).{0,12}退款|退款.{0,12}(?:支持|可以|允许)/.test(text)
  ) {
    refundAllowed = true;
  }

  return { topics, refundAllowed, dayWindows, channels };
}

function setOverlap<T>(left: Set<T>, right: Set<T>): T[] {
  const shared: T[] = [];
  for (const item of left) {
    if (right.has(item)) shared.push(item);
  }
  return shared;
}

function contradictionFromSignals(
  probe: PolicySignals,
  candidate: PolicySignals,
): { score: number; reason: string } | null {
  const sharedTopics = setOverlap(probe.topics, candidate.topics);
  if (sharedTopics.length === 0) return null;

  if (
    probe.refundAllowed !== undefined &&
    candidate.refundAllowed !== undefined &&
    probe.refundAllowed !== candidate.refundAllowed &&
    sharedTopics.includes("refund")
  ) {
    return {
      score: 0.95,
      reason: `policy_conflict:refund_allowed:${candidate.refundAllowed}->${probe.refundAllowed}`,
    };
  }

  if (sharedTopics.includes("refund") && probe.dayWindows.length && candidate.dayWindows.length) {
    const probeMin = Math.min(...probe.dayWindows);
    const candidateMin = Math.min(...candidate.dayWindows);
    if (Math.abs(probeMin - candidateMin) >= 2) {
      return {
        score: 0.85,
        reason: `policy_conflict:refund_window:${candidateMin}d->${probeMin}d`,
      };
    }
  }

  const sharedChannels = setOverlap(probe.channels, candidate.channels);
  if (
    sharedTopics.length > 0 &&
    probe.channels.size > 0 &&
    candidate.channels.size > 0 &&
    sharedChannels.length === 0
  ) {
    return {
      score: 0.72,
      reason: `process_conflict:channel:${[...candidate.channels].join("+")}->${[
        ...probe.channels,
      ].join("+")}`,
    };
  }

  return null;
}

/** KB-20: signal-aware reconcile against active FAQ chunks. */
export async function detectKbContradictions(
  db: KeenaiDb,
  input: DetectKbContradictionsInput,
): Promise<KbContradictionHit[]> {
  const threshold = input.overlapThreshold ?? KB_RECONCILE_OVERLAP_THRESHOLD;
  const signalThreshold = input.signalThreshold ?? KB_RECONCILE_SIGNAL_THRESHOLD;
  const probe = `${input.question}\n${input.answer}`;
  const probeSignals = extractPolicySignals(probe);

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
    const signalConflict = contradictionFromSignals(probeSignals, extractPolicySignals(combined));
    const contradictionScore = Math.max(score, signalConflict?.score ?? 0);
    if (score < threshold && contradictionScore < signalThreshold) continue;
    if (!signalConflict && score > 0.95) continue;
    hits.push({
      documentId,
      documentTitle: entry.title,
      overlapScore: score,
      contradictionScore,
      reason: signalConflict?.reason ?? `topic_overlap:${score.toFixed(2)}`,
    });
  }

  return hits.sort(
    (a, b) => b.contradictionScore - a.contradictionScore || b.overlapScore - a.overlapScore,
  );
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
