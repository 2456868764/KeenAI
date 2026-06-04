import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbQueryLogs, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

describe("kb_query_logs schema migration", () => {
  it("creates kb_query_logs table", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "kbl", name: "KBL" }).returning();
    if (!org) throw new Error("org missing");
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand missing");

    const [log] = await db
      .insert(kbQueryLogs)
      .values({
        orgId: org.id,
        brandId: brand.id,
        queryText: "export data",
        retrievedChunkIds: ["01CHUNK"],
        scores: [0.9],
        latencyMs: 12,
        userFeedback: "helpful",
      })
      .returning();

    const rows = await db
      .select()
      .from(kbQueryLogs)
      .where(eq(kbQueryLogs.id, log?.id ?? ""));
    expect(rows[0]?.userFeedback).toBe("helpful");

    await store.close();
  });
});
