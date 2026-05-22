import type { VectorStore } from "@keenai/storage";
import { describe, expect, it } from "vitest";
import { embedAdmittedMemoryChunk } from "./chunk-vector-index.js";
import { createStubMemoryChunkEmbedder } from "./embed/stub-embedder.js";

function mockVectorStore(): VectorStore & { rows: Array<{ id: string; embedding: number[] }> } {
  const rows: Array<{ id: string; embedding: number[] }> = [];
  return {
    rows,
    async upsert(items) {
      for (const item of items) {
        const idx = rows.findIndex((r) => r.id === item.id);
        if (idx >= 0) rows[idx] = { id: item.id, embedding: item.embedding };
        else rows.push({ id: item.id, embedding: item.embedding });
      }
    },
    async query() {
      return [];
    },
    async deleteByIds() {},
  };
}

describe("embedAdmittedMemoryChunk", () => {
  const base = {
    chunkId: "chunk-1",
    orgId: "org-1",
    brandId: "brand-1",
    bodyMd: "## Message\n\nHello vector memory",
    lifecycle: "admitted" as const,
    created: true,
  };

  it("embeds admitted chunks when embedder and vector store are provided", async () => {
    const embedder = createStubMemoryChunkEmbedder(8);
    const store = mockVectorStore();

    const result = await embedAdmittedMemoryChunk(embedder, store, base);

    expect(result.embedded).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.id).toBe("chunk-1");
    expect(store.rows[0]?.embedding).toHaveLength(8);
  });

  it("skips non-admitted lifecycle", async () => {
    const embedder = createStubMemoryChunkEmbedder(8);
    const store = mockVectorStore();

    const result = await embedAdmittedMemoryChunk(embedder, store, {
      ...base,
      lifecycle: "buffered",
    });

    expect(result).toEqual({ embedded: false, reason: "not_admitted" });
    expect(store.rows).toHaveLength(0);
  });

  it("skips when embedder or vector store is missing", async () => {
    const embedder = createStubMemoryChunkEmbedder(8);

    expect(await embedAdmittedMemoryChunk(null, mockVectorStore(), base)).toEqual({
      embedded: false,
      reason: "embed_disabled",
    });
    expect(await embedAdmittedMemoryChunk(embedder, null, base)).toEqual({
      embedded: false,
      reason: "embed_disabled",
    });
  });
});
