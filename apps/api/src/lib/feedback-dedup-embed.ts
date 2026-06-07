import { createBgeM3KbQueryEmbedder, resolveKbEmbedderProvider } from "@keenai/kb";
import type { FeedbackPostVectorStore } from "@keenai/storage";
import { getFeedbackPostVectorStore } from "./feedback-post-vector-init.js";

export type FeedbackDedupMethod = "lexical" | "embedding" | "both";

export function combineDedupText(title: string | undefined, plainText: string): string {
  const parts = [title?.trim(), plainText.trim()].filter(Boolean);
  return parts.join("\n");
}

export async function indexFeedbackPostEmbedding(input: {
  postId: string;
  orgId: string;
  boardId: string;
  text: string;
  vectorStore?: FeedbackPostVectorStore | null;
}) {
  const store = input.vectorStore ?? getFeedbackPostVectorStore();
  if (!store) return;

  const embedder = createBgeM3KbQueryEmbedder(resolveKbEmbedderProvider());
  const embedding = await embedder.embed(input.text);
  await store.upsert([
    {
      id: input.postId,
      embedding,
      metadata: {
        orgId: input.orgId,
        boardId: input.boardId,
        model: resolveKbEmbedderProvider() === "xenova" ? "Xenova/bge-m3" : "stub/hash-v1",
      },
    },
  ]);
}

export async function searchFeedbackPostEmbeddings(input: {
  orgId: string;
  boardId: string;
  text: string;
  threshold: number;
  vectorStore?: FeedbackPostVectorStore | null;
}): Promise<Map<string, { score: number; method: FeedbackDedupMethod }>> {
  const store = input.vectorStore ?? getFeedbackPostVectorStore();
  const results = new Map<string, { score: number; method: FeedbackDedupMethod }>();
  if (!store) return results;

  const embedder = createBgeM3KbQueryEmbedder(resolveKbEmbedderProvider());
  const embedding = await embedder.embed(input.text);
  const hits = await store.query({
    orgId: input.orgId,
    boardId: input.boardId,
    embedding,
    limit: 10,
    minScore: input.threshold,
  });

  for (const hit of hits) {
    results.set(hit.id, {
      score: Number(hit.score.toFixed(3)),
      method: "embedding",
    });
  }

  return results;
}
