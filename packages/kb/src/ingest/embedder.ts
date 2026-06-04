import {
  KB_STUB_EMBED_DIMENSIONS,
  KB_STUB_EMBED_MODEL,
  type KbEmbeddedChunk,
  embedKbChunkStub,
} from "./embed-chunks-stub.js";

export const BGE_M3_MODEL_ID = "Xenova/bge-m3";
export const BGE_M3_DIMENSIONS = 1024;

export type KbChunkEmbedder = {
  model: string;
  dimensions: number;
  embed: (content: string) => Promise<number[]>;
};

export type KbEmbedderProvider = "stub" | "xenova";

type FeaturePipeline = (
  text: string,
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let xenovaPipelinePromise: Promise<FeaturePipeline> | null = null;

/** @internal Test-only cache reset. */
export function resetXenovaPipelineCacheForTests(): void {
  xenovaPipelinePromise = null;
}

async function loadXenovaPipeline(): Promise<FeaturePipeline> {
  if (!xenovaPipelinePromise) {
    xenovaPipelinePromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("feature-extraction", BGE_M3_MODEL_ID, {
        quantized: true,
      }) as Promise<FeaturePipeline>;
    })();
  }
  return xenovaPipelinePromise;
}

/** `@xenova/transformers` bge-m3 embedder (KB-07). */
export function createXenovaBgeM3KbEmbedder(): KbChunkEmbedder {
  return {
    model: BGE_M3_MODEL_ID,
    dimensions: BGE_M3_DIMENSIONS,
    async embed(content) {
      const pipe = await loadXenovaPipeline();
      const output = await pipe(content, { pooling: "mean", normalize: true });
      const data = output.data;
      return Array.from(data instanceof Float32Array ? data : new Float32Array(data));
    },
  };
}

export function createStubKbChunkEmbedder(): KbChunkEmbedder {
  return {
    model: KB_STUB_EMBED_MODEL,
    dimensions: KB_STUB_EMBED_DIMENSIONS,
    async embed(content) {
      return embedKbChunkStub(content).embedding;
    },
  };
}

export function createKbChunkEmbedder(provider: KbEmbedderProvider = "stub"): KbChunkEmbedder {
  return provider === "xenova" ? createXenovaBgeM3KbEmbedder() : createStubKbChunkEmbedder();
}

export function resolveKbEmbedderProvider(
  env: { KB_EMBED_PROVIDER?: string } = process.env as { KB_EMBED_PROVIDER?: string },
): KbEmbedderProvider {
  return env.KB_EMBED_PROVIDER === "xenova" ? "xenova" : "stub";
}

/** Embed one KB chunk (document + query share the same embedder). */
export async function embedKbChunk(
  content: string,
  embedder: KbChunkEmbedder = createStubKbChunkEmbedder(),
): Promise<KbEmbeddedChunk> {
  const embedding = await embedder.embed(content);
  return {
    model: embedder.model,
    dimensions: embedder.dimensions,
    embedding,
  };
}
