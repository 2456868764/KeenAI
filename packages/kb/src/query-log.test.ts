import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbQueryLogs, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createKbQueryLog, kbHitLogScore, setKbQueryLogFeedback } from "./query-log.js";

describe("kb query log KB-12", () => {
  it("creates log and updates feedback", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "log", name: "Log" }).returning();
    if (!org) throw new Error("org missing");
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand missing");

    const log = await createKbQueryLog(db, {
      orgId: org.id,
      brandId: brand.id,
      queryText: "billing invoice",
      latencyMs: 42.7,
      hits: [
        { chunkId: "c1", fusedScore: 0.8, rerankScore: 1.2 },
        { chunkId: "c2", fusedScore: 0.5 },
      ],
    });

    const [row] = await db.select().from(kbQueryLogs).where(eq(kbQueryLogs.id, log.id));
    expect(row?.queryText).toBe("billing invoice");
    expect(row?.retrievedChunkIds).toEqual(["c1", "c2"]);
    expect(row?.scores).toEqual([1.2, 0.5]);
    expect(row?.latencyMs).toBe(43);
    expect(kbHitLogScore({ chunkId: "x", fusedScore: 1, rerankScore: 2 })).toBe(2);

    const ok = await setKbQueryLogFeedback(db, {
      orgId: org.id,
      logId: log.id,
      feedback: "helpful",
    });
    expect(ok).toBe(true);

    const [updated] = await db.select().from(kbQueryLogs).where(eq(kbQueryLogs.id, log.id));
    expect(updated?.userFeedback).toBe("helpful");

    const wrongOrg = await setKbQueryLogFeedback(db, {
      orgId: "wrong-org",
      logId: log.id,
      feedback: "not_helpful",
    });
    expect(wrongOrg).toBe(false);

    await store.close();
  });
});
