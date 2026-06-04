import type { KeenaiDb } from "@keenai/storage";
import {
  KB_QUERY_LOG_FEEDBACK,
  type KbQueryLogFeedback,
  kbQueryLogs,
} from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export const KEENI_KB_KB12 = {
  enabled: true,
  target: "kb.search.query_log",
  notes: "KB-12: persist search hits + latency; feedback helpful/not_helpful.",
} as const;

export { KB_QUERY_LOG_FEEDBACK, type KbQueryLogFeedback };

export type KbQueryLogHitSnapshot = {
  chunkId: string;
  fusedScore: number;
  rerankScore?: number;
};

export type CreateKbQueryLogInput = {
  orgId: string;
  brandId: string;
  queryText: string;
  hits: KbQueryLogHitSnapshot[];
  latencyMs: number;
};

export type CreateKbQueryLogResult = {
  id: string;
};

export type SetKbQueryLogFeedbackInput = {
  orgId: string;
  logId: string;
  feedback: KbQueryLogFeedback;
};

export function kbHitLogScore(hit: KbQueryLogHitSnapshot): number {
  return hit.rerankScore ?? hit.fusedScore;
}

/** KB-12: write a retrieval log row after search. */
export async function createKbQueryLog(
  db: KeenaiDb,
  input: CreateKbQueryLogInput,
): Promise<CreateKbQueryLogResult> {
  const [row] = await db
    .insert(kbQueryLogs)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      queryText: input.queryText.trim(),
      retrievedChunkIds: input.hits.map((hit) => hit.chunkId),
      scores: input.hits.map((hit) => kbHitLogScore(hit)),
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
    })
    .returning({ id: kbQueryLogs.id });

  if (!row?.id) throw new Error("kb_query_log_insert_failed");
  return { id: row.id };
}

/** KB-12: attach user feedback to an existing query log. */
export async function setKbQueryLogFeedback(
  db: KeenaiDb,
  input: SetKbQueryLogFeedbackInput,
): Promise<boolean> {
  const updated = await db
    .update(kbQueryLogs)
    .set({ userFeedback: input.feedback })
    .where(and(eq(kbQueryLogs.id, input.logId), eq(kbQueryLogs.orgId, input.orgId)))
    .returning({ id: kbQueryLogs.id });

  return updated.length > 0;
}
