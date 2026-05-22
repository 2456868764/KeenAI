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

/** FTS5 index for Memory Tree chunk bodies (Keeni Memory KM-02). */
export function createLibsqlMemoryChunkFtsStore(client: Client): FTSStore {
  return {
    async index(doc) {
      await client.execute({
        sql: "DELETE FROM fts_memory_chunks WHERE chunk_id = ?",
        args: [doc.id],
      });
      await client.execute({
        sql: `INSERT INTO fts_memory_chunks (chunk_id, org_id, brand_id, body)
              VALUES (?, ?, ?, ?)`,
        args: [doc.id, doc.orgId, doc.brandId ?? "", doc.body],
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
        sql: `SELECT chunk_id,
                     snippet(fts_memory_chunks, 3, '…', '…', '…', 64) AS snippet,
                     bm25(fts_memory_chunks) AS score
              FROM fts_memory_chunks
              WHERE fts_memory_chunks MATCH ? AND org_id = ?${brandFilter}
              ORDER BY score
              LIMIT ?`,
        args,
      });

      return result.rows.map((row) => ({
        id: String(row.chunk_id),
        score: Number(row.score ?? 0),
        snippet: row.snippet != null ? String(row.snippet) : undefined,
      })) satisfies FtsHit[];
    },

    async deleteByIds(ids) {
      for (const id of ids) {
        await client.execute({
          sql: "DELETE FROM fts_memory_chunks WHERE chunk_id = ?",
          args: [id],
        });
      }
    },
  };
}

/** Idempotent FTS5 virtual table for memory chunk search. */
export async function ensureMemoryChunkFtsSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_chunks USING fts5(
      chunk_id UNINDEXED,
      org_id UNINDEXED,
      brand_id UNINDEXED,
      body,
      tokenize = 'porter unicode61'
    )
  `);
}
