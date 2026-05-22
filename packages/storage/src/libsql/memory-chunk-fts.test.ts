import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createLibsqlMemoryChunkFtsStore, ensureMemoryChunkFtsSchema } from "./memory-chunk-fts.js";

describe("createLibsqlMemoryChunkFtsStore", () => {
  it("indexes and searches memory chunk bodies", async () => {
    const client = createClient({ url: ":memory:" });
    await ensureMemoryChunkFtsSchema(client);
    const fts = createLibsqlMemoryChunkFtsStore(client);

    await fts.index({
      id: "chunk_billing",
      orgId: "org-1",
      brandId: "brand-1",
      body: "Customer asked about invoice and billing cycle",
    });
    await fts.index({
      id: "chunk_shipping",
      orgId: "org-1",
      brandId: "brand-1",
      body: "Warehouse delay on shipment tracking",
    });

    const hits = await fts.search({ orgId: "org-1", brandId: "brand-1", q: "invoice", limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("chunk_billing");

    client.close();
  });
});
