import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { createHelpCenterStubConnector, createKeenaiKb } from "@keenai/kb";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  kbQueryLogs,
  kbSources,
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { getKbChunkFtsStore } from "./lib/kb-chunk-fts-init.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

async function setupKbApiTest() {
  const store = createLibsqlStore({ url: ":memory:" });
  const db = store.db;
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/storage/migrations/libsql",
  );
  await migrate(db, { migrationsFolder });

  const [orgRow] = await db
    .insert(organizations)
    .values({ slug: "kbapi", name: "KB API" })
    .returning();
  const org = requireRow(orgRow, "org");
  const [brandRow] = await db
    .insert(brands)
    .values({ orgId: org.id, slug: "default", name: "Default" })
    .returning();
  const brand = requireRow(brandRow, "brand");

  const passwordHash = await hashPassword("keenai-demo-12");
  const [accountRow] = await db
    .insert(accounts)
    .values({ email: "kb@keenai.local", passwordHash, name: "Owner" })
    .returning();
  const account = requireRow(accountRow, "account");

  await db.insert(members).values({
    orgId: org.id,
    accountId: account.id,
    role: "admin",
    status: "active",
  });

  const env = parseApiEnv({
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
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

  const loginRes = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "kb@keenai.local",
      password: "keenai-demo-12",
      orgSlug: "kbapi",
    }),
  });
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  return { app, store, db, org, brand, auth: { Authorization: `Bearer ${accessToken}` } };
}

describe("kb search API", () => {
  it("returns hybrid search hits for indexed help center docs", async () => {
    const { app, store, db, org, brand, auth } = await setupKbApiTest();

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

    const searchRes = await app.request(
      `/api/v1/kb/search?brandId=${brand.id}&q=billing%20invoice`,
      { headers: auth },
    );
    expect(searchRes.status).toBe(200);
    const body = (await searchRes.json()) as {
      logId: string;
      results: { hits: Array<{ documentTitle: string; fusedScore: number; chunkId: string }> };
    };
    expect(body.results.hits.length).toBeGreaterThan(0);
    expect(body.results.hits.some((hit) => hit.documentTitle === "Billing FAQ")).toBe(true);
    expect(body.logId).toMatch(/^[0-9A-Z]{26}$/i);

    const [logRow] = await db.select().from(kbQueryLogs).where(eq(kbQueryLogs.id, body.logId));
    expect(logRow?.queryText).toBe("billing invoice");
    expect(logRow?.retrievedChunkIds?.length).toBe(body.results.hits.length);
    expect(logRow?.latencyMs).toBeGreaterThanOrEqual(0);

    const feedbackRes = await app.request(`/api/v1/kb/search/${body.logId}/feedback`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "helpful" }),
    });
    expect(feedbackRes.status).toBe(200);
    const feedbackBody = (await feedbackRes.json()) as { ok: boolean; feedback: string };
    expect(feedbackBody.ok).toBe(true);
    expect(feedbackBody.feedback).toBe("helpful");

    const [afterFeedback] = await db
      .select()
      .from(kbQueryLogs)
      .where(eq(kbQueryLogs.id, body.logId));
    expect(afterFeedback?.userFeedback).toBe("helpful");

    const notFoundRes = await app.request("/api/v1/kb/search/01NOTFOUND0000000000000000/feedback", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "not_helpful" }),
    });
    expect(notFoundRes.status).toBe(404);

    const metricsRes = await app.request(`/api/v1/kb/eval/metrics?brandId=${brand.id}`, {
      headers: auth,
    });
    expect(metricsRes.status).toBe(200);
    const metricsBody = (await metricsRes.json()) as {
      metrics: { totalQueries: number; helpfulRate: number };
    };
    expect(metricsBody.metrics.totalQueries).toBe(1);

    const evalRunRes = await app.request("/api/v1/kb/eval/run", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, maxCases: 5, rerank: false }),
    });
    expect(evalRunRes.status).toBe(200);
    const evalBody = (await evalRunRes.json()) as {
      report: { caseCount: number; passed: boolean };
    };
    expect(evalBody.report.caseCount).toBe(0);

    await store.close();
  });
});
