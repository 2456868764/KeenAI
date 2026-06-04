import type { KeenaiDb } from "@keenai/storage";
import { kbGoldenQueries, kbQueryLogs } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export const KEENI_KB_KB23 = {
  enabled: true,
  target: "kb.eval.golden",
  notes: "KB-23: failed queries → golden eval candidates.",
} as const;

export type PromoteKbGoldenQueryInput = {
  orgId: string;
  brandId: string;
  queryLogId: string;
  expectedChunkIds?: string[];
  expectedAnswer?: string;
  tags?: string[];
  createdBy?: string;
};

/** Promote a not_helpful query log into golden eval set. */
export async function promoteKbQueryLogToGolden(
  db: KeenaiDb,
  input: PromoteKbGoldenQueryInput,
): Promise<{ goldenQueryId: string }> {
  const [log] = await db
    .select()
    .from(kbQueryLogs)
    .where(and(eq(kbQueryLogs.id, input.queryLogId), eq(kbQueryLogs.orgId, input.orgId)))
    .limit(1);

  if (!log) throw new Error("kb_query_log_not_found");
  if (log.userFeedback !== "not_helpful") {
    throw new Error("kb_query_log_not_failed");
  }

  const [row] = await db
    .insert(kbGoldenQueries)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      query: log.queryText,
      expectedChunkIds: input.expectedChunkIds ?? log.retrievedChunkIds ?? [],
      expectedAnswer: input.expectedAnswer,
      tags: input.tags ?? ["from_failed_query"],
      sourceQueryLogId: log.id,
      createdBy: input.createdBy,
    })
    .returning({ id: kbGoldenQueries.id });

  if (!row?.id) throw new Error("kb_golden_query_insert_failed");
  return { goldenQueryId: row.id };
}
