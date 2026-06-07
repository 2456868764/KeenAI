import type { Client } from "@libsql/client";
import type { VectorHit } from "../core/vector-store.js";

const DEFAULT_SCAN_CAP = 500;

export type FeedbackPostVectorQuery = {
  orgId: string;
  boardId: string;
  embedding: number[];
  limit?: number;
  minScore?: number;
};

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

export type FeedbackPostVectorStore = {
  upsert(
    rows: Array<{ id: string; embedding: number[]; metadata?: Record<string, unknown> }>,
  ): Promise<void>;
  query(q: FeedbackPostVectorQuery): Promise<VectorHit[]>;
  deleteByIds(ids: string[]): Promise<void>;
};

/** LibSQL feedback post vectors — cosine search per board partition (P2-12). */
export function createLibsqlFeedbackPostVectorStore(client: Client): FeedbackPostVectorStore {
  return {
    async upsert(rows) {
      for (const row of rows) {
        const orgId = row.metadata?.orgId;
        const boardId = row.metadata?.boardId;
        const model = row.metadata?.model ?? "unknown";
        if (typeof orgId !== "string" || typeof boardId !== "string") {
          throw new Error(
            "feedback_post_vectors upsert requires metadata.orgId and metadata.boardId",
          );
        }

        await client.execute({
          sql: `INSERT OR REPLACE INTO feedback_post_vectors
                (post_id, org_id, board_id, model, dimensions, embedding_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            row.id,
            orgId,
            boardId,
            String(model),
            row.embedding.length,
            JSON.stringify(row.embedding),
            Date.now(),
          ],
        });
      }
    },

    async query(q) {
      const limit = q.limit ?? 10;
      const result = await client.execute({
        sql: `SELECT post_id, embedding_json
              FROM feedback_post_vectors
              WHERE org_id = ? AND board_id = ?
              LIMIT ?`,
        args: [q.orgId, q.boardId, DEFAULT_SCAN_CAP],
      });

      const hits: VectorHit[] = [];
      for (const row of result.rows) {
        const embedding = parseEmbedding(row.embedding_json);
        if (embedding.length === 0) continue;
        const score = cosineSimilarity(q.embedding, embedding);
        if (q.minScore != null && score < q.minScore) continue;
        hits.push({
          id: String(row.post_id),
          score,
        });
      }

      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, limit);
    },

    async deleteByIds(ids) {
      for (const id of ids) {
        await client.execute({
          sql: "DELETE FROM feedback_post_vectors WHERE post_id = ?",
          args: [id],
        });
      }
    },
  };
}
