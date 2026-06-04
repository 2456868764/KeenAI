import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKbQueryLog } from "@keenai/kb";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbGoldenQueries, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { setKbQueryLogFeedback } from "../query-log.js";
import { computeKbEvalMetrics, promoteKbQueryLogToGolden } from "./index.js";

describe("KB-23 eval", () => {
  it("promotes not_helpful logs to golden queries", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "eval", name: "Eval" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();

    const log = await createKbQueryLog(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      queryText: "refund policy",
      hits: [{ chunkId: "c1", fusedScore: 0.5 }],
      latencyMs: 10,
    });
    await setKbQueryLogFeedback(db, {
      orgId: org?.id ?? "",
      logId: log.id,
      feedback: "not_helpful",
    });

    const { goldenQueryId } = await promoteKbQueryLogToGolden(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      queryLogId: log.id,
    });

    const [golden] = await db
      .select()
      .from(kbGoldenQueries)
      .where(eq(kbGoldenQueries.id, goldenQueryId));
    expect(golden?.query).toBe("refund policy");

    const metrics = await computeKbEvalMetrics(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
    });
    expect(metrics.totalQueries).toBe(1);
    expect(metrics.notHelpfulRate).toBe(1);

    await store.close();
  });
});
