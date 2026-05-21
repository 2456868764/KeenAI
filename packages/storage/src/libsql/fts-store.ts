import type { Client } from "@libsql/client";
import type { FTSStore, FtsHit, FtsQuery } from "../core/fts-store.js";

function escapeFtsQuery(q: string): string {
  const cleaned = q
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned.map((t) => `"${t.replace(/"/g, "")}"`).join(" ");
}

export function createLibsqlFtsStore(client: Client): FTSStore {
  return {
    async index(doc) {
      await client.execute({
        sql: "DELETE FROM fts_conversations WHERE conversation_id = ?",
        args: [doc.id],
      });
      await client.execute({
        sql: `INSERT INTO fts_conversations (conversation_id, org_id, brand_id, subject, body)
              VALUES (?, ?, ?, ?, ?)`,
        args: [doc.id, doc.orgId, doc.brandId ?? "", doc.body.split("\n")[0] ?? "", doc.body],
      });
    },

    async search(q) {
      const match = escapeFtsQuery(q.q);
      if (!match) return [];

      const limit = q.limit ?? 20;
      const brandFilter = q.brandId ? " AND brand_id = ?" : "";
      const args: (string | number)[] = [match, q.orgId];
      if (q.brandId) args.push(q.brandId);
      args.push(limit);

      const result = await client.execute({
        sql: `SELECT conversation_id,
                     snippet(fts_conversations, 4, '…', '…', '…', 64) AS snippet,
                     bm25(fts_conversations) AS score
              FROM fts_conversations
              WHERE fts_conversations MATCH ? AND org_id = ?${brandFilter}
              ORDER BY score
              LIMIT ?`,
        args,
      });

      return result.rows.map((row) => ({
        id: String(row.conversation_id),
        score: Number(row.score ?? 0),
        snippet: row.snippet != null ? String(row.snippet) : undefined,
      })) satisfies FtsHit[];
    },

    async deleteByIds(ids) {
      for (const id of ids) {
        await client.execute({
          sql: "DELETE FROM fts_conversations WHERE conversation_id = ?",
          args: [id],
        });
      }
    },
  };
}

/** Idempotent FTS5 virtual table for conversation search. */
export async function ensureFtsSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_conversations USING fts5(
      conversation_id UNINDEXED,
      org_id UNINDEXED,
      brand_id UNINDEXED,
      subject,
      body,
      tokenize = 'porter unicode61'
    )
  `);
}
