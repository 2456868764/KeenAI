import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHelpCenterStubConnector, createKeenaiKb } from "@keenai/kb";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbQueryLogs, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { getKbChunkFtsStore } from "./lib/kb-chunk-fts-init.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

async function setupPublicKbAnswerTest() {
  const store = createLibsqlStore({ url: ":memory:" });
  const db = store.db;
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/storage/migrations/libsql",
  );
  await migrate(db, { migrationsFolder });

  const [orgRow] = await db
    .insert(organizations)
    .values({ slug: "kbans", name: "KB Answers" })
    .returning();
  const org = requireRow(orgRow, "org");
  const [brandRow] = await db
    .insert(brands)
    .values({ orgId: org.id, slug: "default", name: "Default" })
    .returning();
  const brand = requireRow(brandRow, "brand");

  const env = parseApiEnv({
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
    PORTAL_PUBLIC_READ: "true",
    LLM_PROVIDER: "stub",
  });

  const app = createApp({
    store,
    fts: null,
    authConfig: {
      jwtSecret: "test-secret-at-least-32-characters-long!!",
      accessTtlSec: 900,
      refreshTtlSec: 604_800,
      appUrl: "http://localhost:3000",
    },
    env,
    log: createLogger(env),
    startedAt: new Date(),
  });

  return { app, store, db, org, brand };
}

describe("public kb answer", () => {
  it("streams stub AI answer over SSE and accepts feedback", async () => {
    const { app, store, db, org, brand } = await setupPublicKbAnswerTest();

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    const kbSource = requireRow(source, "source");

    const kb = createKeenaiKb({ db });
    await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createHelpCenterStubConnector(),
    });

    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    const chunkFts = getKbChunkFtsStore();
    for (const document of documents) {
      await kb.indexDocument({
        orgId: org.id,
        brandId: brand.id,
        documentId: document.id,
        chunkFtsIndexer: chunkFts,
      });
    }

    const params = new URLSearchParams({
      brandId: brand.id,
      q: "billing invoice",
      limit: "5",
      rerank: "false",
    });
    const res = await app.request(`/api/v1/public/kbans/kb/answer?${params}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain("event: meta");
    expect(body).toContain("event: done");
    expect(body).toContain('"logId"');

    const metaLine = body
      .split("\n")
      .find((line) => line.startsWith("data:") && line.includes("logId"));
    expect(metaLine).toBeTruthy();
    const metaJson = metaLine?.replace(/^data:\s*/, "") ?? "{}";
    const meta = JSON.parse(metaJson) as { logId: string; citations: unknown[] };
    expect(meta.logId).toMatch(/^[0-9A-Z]{26}$/i);
    expect(Array.isArray(meta.citations)).toBe(true);

    const feedbackRes = await app.request(`/api/v1/public/kbans/kb/search/${meta.logId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "helpful" }),
    });
    expect(feedbackRes.status).toBe(200);
    const feedbackBody = (await feedbackRes.json()) as { ok: boolean };
    expect(feedbackBody.ok).toBe(true);

    const [logRow] = await db.select().from(kbQueryLogs).where(eq(kbQueryLogs.id, meta.logId));
    expect(logRow?.userFeedback).toBe("helpful");

    await store.close();
  });
});
