import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
  createLibsqlMemoryChunkVectorStore,
  ensureMemoryChunkVectorSchema,
} from "./memory-chunk-vectors.js";

describe("createLibsqlMemoryChunkVectorStore", () => {
  it("upserts and queries vectors by cosine similarity", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute("CREATE TABLE organizations (id TEXT PRIMARY KEY NOT NULL)");
    await client.execute(
      "CREATE TABLE brands (id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id))",
    );
    await client.execute(
      "CREATE TABLE memory_chunks (id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL, brand_id TEXT NOT NULL)",
    );
    await client.execute("INSERT INTO organizations (id) VALUES ('org-1')");
    await client.execute("INSERT INTO brands (id, org_id) VALUES ('brand-1', 'org-1')");
    await client.execute(
      "INSERT INTO memory_chunks (id, org_id, brand_id) VALUES ('chunk_a', 'org-1', 'brand-1'), ('chunk_b', 'org-1', 'brand-1')",
    );
    await ensureMemoryChunkVectorSchema(client);
    const store = createLibsqlMemoryChunkVectorStore(client);

    await store.upsert([
      {
        id: "chunk_a",
        embedding: [1, 0, 0],
        metadata: { orgId: "org-1", brandId: "brand-1", model: "test" },
      },
      {
        id: "chunk_b",
        embedding: [0, 1, 0],
        metadata: { orgId: "org-1", brandId: "brand-1", model: "test" },
      },
    ]);

    const hits = await store.query({
      orgId: "org-1",
      brandId: "brand-1",
      embedding: [0.9, 0.1, 0],
      limit: 2,
    });

    expect(hits[0]?.id).toBe("chunk_a");
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);

    client.close();
  });
});
