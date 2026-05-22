import type { VectorStore } from "@keenai/storage";
import { extractBodyFromCanonicalMd } from "./canonical-body.js";

export type MemoryChunkEmbedder = {
  model: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
};

export async function embedAdmittedMemoryChunk(
  embedder: MemoryChunkEmbedder | null | undefined,
  vectorStore: VectorStore | null | undefined,
  input: {
    chunkId: string;
    orgId: string;
    brandId: string;
    bodyMd: string;
    lifecycle: string;
    created: boolean;
  },
): Promise<{ embedded: boolean; reason?: string }> {
  if (!input.created) return { embedded: false, reason: "not_created" };
  if (input.lifecycle !== "admitted") return { embedded: false, reason: "not_admitted" };
  if (!embedder || !vectorStore) return { embedded: false, reason: "embed_disabled" };

  const text = extractBodyFromCanonicalMd(input.bodyMd);
  if (!text) return { embedded: false, reason: "empty_body" };

  const embedding = await embedder.embed(text);
  await vectorStore.upsert([
    {
      id: input.chunkId,
      embedding,
      metadata: {
        orgId: input.orgId,
        brandId: input.brandId,
        model: embedder.model,
      },
    },
  ]);

  return { embedded: true };
}
