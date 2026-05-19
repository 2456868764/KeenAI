import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createLibsqlFtsStore, ensureFtsSchema } from "./fts-store.js";

describe("createLibsqlFtsStore", () => {
  it("indexes and searches conversation text", async () => {
    const client = createClient({ url: ":memory:" });
    await ensureFtsSchema(client);
    const fts = createLibsqlFtsStore(client);

    await fts.index({
      id: "conv-1",
      orgId: "org-1",
      brandId: "brand-1",
      body: "billing invoice refund",
    });
    await fts.index({
      id: "conv-2",
      orgId: "org-1",
      brandId: "brand-1",
      body: "shipping delay warehouse",
    });

    const hits = await fts.search({ orgId: "org-1", q: "refund", limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("conv-1");

    client.close();
  });
});
