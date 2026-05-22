import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
  createLibsqlMemorySummaryFtsStore,
  ensureMemorySummaryFtsSchema,
} from "./memory-summary-fts.js";

describe("createLibsqlMemorySummaryFtsStore", () => {
  it("indexes and searches sealed summaries and daily digests", async () => {
    const client = createClient({ url: ":memory:" });
    await ensureMemorySummaryFtsSchema(client);
    const fts = createLibsqlMemorySummaryFtsStore(client);

    await fts.index({
      id: "sum_seal",
      orgId: "org-1",
      brandId: "brand-1",
      scopeKey: "conv:conv-1",
      level: 1,
      body: "Conversation seal\nCustomer asked about invoice billing cycle",
    });
    await fts.index({
      id: "sum_daily",
      orgId: "org-1",
      brandId: "brand-1",
      scopeKey: "brand:brand-1:day:2026-05-21",
      level: 0,
      body: "Daily digest\nThree billing tickets resolved today",
    });

    const sealHits = await fts.search({
      orgId: "org-1",
      brandId: "brand-1",
      q: "invoice",
      scope: "conversation",
      limit: 10,
    });
    expect(sealHits).toHaveLength(1);
    expect(sealHits[0]?.id).toBe("sum_seal");

    const dailyHits = await fts.search({
      orgId: "org-1",
      brandId: "brand-1",
      q: "billing",
      scope: "all",
      limit: 10,
    });
    expect(dailyHits.map((hit) => hit.id).sort()).toEqual(["sum_daily", "sum_seal"]);

    client.close();
  });
});
