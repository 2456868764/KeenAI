import type { Client } from "@libsql/client";
import type { FtsHit } from "../core/fts-store.js";

function escapeFtsQuery(q: string): string {
  const cleaned = q
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned.map((t) => `"${t.replace(/"/g, "")}"`).join(" ");
}

export type MemorySummaryFtsDoc = {
  id: string;
  orgId: string;
  brandId: string;
  scopeKey: string;
  level: number;
  body: string;
};

export type MemorySummaryFtsQuery = {
  orgId: string;
  brandId: string;
  q: string;
  limit?: number;
  scope?: "all" | "conversation" | "customer" | "channel";
};

export type MemorySummaryFtsStore = {
  index(doc: MemorySummaryFtsDoc): Promise<void>;
  search(q: MemorySummaryFtsQuery): Promise<FtsHit[]>;
  deleteByIds(ids: string[]): Promise<void>;
};

function scopeKeyFilter(scope: MemorySummaryFtsQuery["scope"]): string {
  switch (scope) {
    case "conversation":
      return " AND scope_key LIKE 'conv:%'";
    case "customer":
      return " AND scope_key LIKE 'customer:%'";
    case "channel":
      return " AND scope_key LIKE 'channel:%'";
    default:
      return "";
  }
}

/** FTS5 index for sealed summaries and brand daily digests (Keeni Memory KM-06). */
export function createLibsqlMemorySummaryFtsStore(client: Client): MemorySummaryFtsStore {
  return {
    async index(doc) {
      await client.execute({
        sql: "DELETE FROM fts_memory_summaries WHERE summary_id = ?",
        args: [doc.id],
      });
      await client.execute({
        sql: `INSERT INTO fts_memory_summaries
              (summary_id, org_id, brand_id, scope_key, level, body)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [doc.id, doc.orgId, doc.brandId, doc.scopeKey, doc.level, doc.body],
      });
    },

    async search(q) {
      const match = escapeFtsQuery(q.q);
      if (!match) return [];

      const limit = q.limit ?? 20;
      const scopeFilter = scopeKeyFilter(q.scope ?? "all");
      const args: (string | number)[] = [match, q.orgId, q.brandId, limit];

      const result = await client.execute({
        sql: `SELECT summary_id,
                     snippet(fts_memory_summaries, 5, '…', '…', '…', 64) AS snippet,
                     bm25(fts_memory_summaries) AS score
              FROM fts_memory_summaries
              WHERE fts_memory_summaries MATCH ? AND org_id = ? AND brand_id = ?${scopeFilter}
              ORDER BY score
              LIMIT ?`,
        args,
      });

      return result.rows.map((row) => ({
        id: String(row.summary_id),
        score: Number(row.score ?? 0),
        snippet: row.snippet != null ? String(row.snippet) : undefined,
      })) satisfies FtsHit[];
    },

    async deleteByIds(ids) {
      for (const id of ids) {
        await client.execute({
          sql: "DELETE FROM fts_memory_summaries WHERE summary_id = ?",
          args: [id],
        });
      }
    },
  };
}

/** Idempotent FTS5 virtual table for memory summary search. */
export async function ensureMemorySummaryFtsSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_summaries USING fts5(
      summary_id UNINDEXED,
      org_id UNINDEXED,
      brand_id UNINDEXED,
      scope_key UNINDEXED,
      level UNINDEXED,
      body,
      tokenize = 'porter unicode61'
    )
  `);
}
