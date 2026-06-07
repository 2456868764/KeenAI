import type { FeedbackPostVectorStore } from "@keenai/storage";
import { describe, expect, it } from "vitest";
import { combineDedupText, searchFeedbackPostEmbeddings } from "./feedback-dedup-embed.js";

describe("feedback dedup embed", () => {
  it("combines title and body for indexing text", () => {
    expect(combineDedupText("Dark mode", "Add theme toggle")).toBe("Dark mode\nAdd theme toggle");
  });

  it("finds identical posts via vector similarity", async () => {
    const text = "Dark mode\nPlease add dark mode to the dashboard";
    const { createBgeM3KbQueryEmbedder } = await import("@keenai/kb");
    const embedder = createBgeM3KbQueryEmbedder("stub");
    const embedding = await embedder.embed(text);

    const rows = new Map<string, number[]>();
    const store: FeedbackPostVectorStore = {
      async upsert(upserts) {
        for (const row of upserts) rows.set(row.id, row.embedding);
      },
      async query(q) {
        const target = rows.get("post-1");
        if (!target) return [];
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < target.length; i++) {
          const a = q.embedding[i] ?? 0;
          const b = target[i] ?? 0;
          dot += a * b;
          normA += a * a;
          normB += b * b;
        }
        const score = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
        return score >= (q.minScore ?? 0) ? [{ id: "post-1", score }] : [];
      },
      async deleteByIds() {},
    };

    await store.upsert([
      {
        id: "post-1",
        embedding,
        metadata: { orgId: "org-1", boardId: "board-1", model: "stub" },
      },
    ]);

    const hits = await searchFeedbackPostEmbeddings({
      orgId: "org-1",
      boardId: "board-1",
      text,
      threshold: 0.99,
      vectorStore: store,
    });

    expect(hits.get("post-1")?.score).toBeGreaterThanOrEqual(0.99);
    expect(hits.get("post-1")?.method).toBe("embedding");
  });
});
