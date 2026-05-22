import type { Client } from "@libsql/client";
import type { VectorHit, VectorQuery, VectorStore } from "../core/vector-store.js";

const DEFAULT_SCAN_CAP = 2_000;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseEmbedding(raw: unknown): number[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((v) => Number(v)) : [];
  } catch {
    return [];
  }
}

/** LibSQL memory chunk vectors — brute-force cosine over brand partition (KM-04). */
export function createLibsqlMemoryChunkVectorStore(client: Client): VectorStore {
  return {
    async upsert(rows) {
      for (const row of rows) {
        const orgId = row.metadata?.orgId;
        const brandId = row.metadata?.brandId;
        const model = row.metadata?.model ?? "unknown";
        if (typeof orgId !== "string" || typeof brandId !== "string") {
          throw new Error(
            "memory_chunk_vectors upsert requires metadata.orgId and metadata.brandId",
          );
        }

        await client.execute({
          sql: `INSERT OR REPLACE INTO memory_chunk_vectors
                (chunk_id, org_id, brand_id, model, dimensions, embedding_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            row.id,
            orgId,
            brandId,
            String(model),
            row.embedding.length,
            JSON.stringify(row.embedding),
            Date.now(),
          ],
        });
      }
    },

    async query(q) {
      const limit = q.limit ?? 20;
      const brandFilter = q.brandId ? " AND brand_id = ?" : "";
      const args: (string | number)[] = [q.orgId];
      if (q.brandId) args.push(q.brandId);
      args.push(DEFAULT_SCAN_CAP);

      const result = await client.execute({
        sql: `SELECT chunk_id, embedding_json
              FROM memory_chunk_vectors
              WHERE org_id = ?${brandFilter}
              LIMIT ?`,
        args,
      });

      const hits: VectorHit[] = [];
      for (const row of result.rows) {
        const embedding = parseEmbedding(row.embedding_json);
        if (embedding.length === 0) continue;
        const score = cosineSimilarity(q.embedding, embedding);
        if (q.minScore != null && score < q.minScore) continue;
        hits.push({
          id: String(row.chunk_id),
          score,
        });
      }

      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, limit);
    },

    async deleteByIds(ids) {
      for (const id of ids) {
        await client.execute({
          sql: "DELETE FROM memory_chunk_vectors WHERE chunk_id = ?",
          args: [id],
        });
      }
    },
  };
}

/** Idempotent memory_chunk_vectors table (also applied via Drizzle migration). */
export async function ensureMemoryChunkVectorSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memory_chunk_vectors (
      chunk_id TEXT PRIMARY KEY NOT NULL,
      org_id TEXT NOT NULL,
      brand_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      embedding_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES memory_chunks(id),
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_mem_chunk_vec_org_brand
    ON memory_chunk_vectors (org_id, brand_id)
  `);
}
