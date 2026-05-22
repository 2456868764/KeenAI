export type OpenAiMemoryChunkEmbedderOptions = {
  apiKey: string;
  model?: string;
  dimensions?: number;
};

type OpenAiEmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

/** OpenAI embeddings API adapter for admitted memory chunks. */
export function createOpenAiMemoryChunkEmbedder(
  options: OpenAiMemoryChunkEmbedderOptions,
): import("../chunk-vector-index.js").MemoryChunkEmbedder {
  const model = options.model ?? "text-embedding-3-small";
  const dimensions = options.dimensions ?? 1536;

  return {
    model: `openai/${model}`,
    dimensions,
    async embed(text) {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: text }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`openai_embeddings_failed (${res.status}): ${body.slice(0, 256)}`);
      }

      const payload = (await res.json()) as OpenAiEmbeddingResponse;
      const embedding = payload.data?.[0]?.embedding;
      if (!embedding || embedding.length === 0) {
        throw new Error("openai_embeddings_empty");
      }
      return embedding;
    },
  };
}
