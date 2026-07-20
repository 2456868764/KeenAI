import { createHmac } from "node:crypto";
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
  it("creates file upload and URL crawl sources for knowledge base ingest", async () => {
    const { app, store, db, brand, auth } = await setupKbApiTest();

    const uploadRes = await app.request("/api/v1/kb/sources/file-upload", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        documents: [
          {
            title: "Refund Policy",
            fileName: "refund-policy.md",
            contentType: "text/markdown",
            sizeBytes: 36,
            rawContent: "# Refund Policy\n\nRefunds take 5 days.",
          },
        ],
      }),
    });
    expect(uploadRes.status).toBe(201);
    const uploadBody = (await uploadRes.json()) as { source: { id: string; type: string } };
    expect(uploadBody.source.type).toBe("file_upload");

    const [uploadedSource] = await db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, uploadBody.source.id));
    expect(uploadedSource?.status).toBe("active");
    expect(uploadedSource?.documentCount).toBe(1);
    expect(uploadedSource?.chunkCount).toBeGreaterThan(0);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<html><title>Billing</title><h1>Billing</h1><p>Invoices renew monthly.</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    try {
      const crawlRes = await app.request("/api/v1/kb/sources/web-crawl", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand.id,
          mode: "individual_links",
          urls: ["https://docs.example.com/billing"],
          title: "Billing Page",
        }),
      });
      expect(crawlRes.status).toBe(201);
      const crawlBody = (await crawlRes.json()) as { source: { id: string; type: string } };
      expect(crawlBody.source.type).toBe("web_crawl");
    } finally {
      globalThis.fetch = originalFetch;
    }

    const listRes = await app.request(`/api/v1/kb/sources?brandId=${brand.id}`, {
      headers: auth,
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      items: Array<{ type: string; documentCount: number; chunkCount: number }>;
    };
    expect(listBody.items.map((item) => item.type)).toEqual(
      expect.arrayContaining(["file_upload", "web_crawl"]),
    );
    expect(listBody.items.every((item) => item.documentCount >= 1)).toBe(true);
    expect(listBody.items.every((item) => item.chunkCount >= 1)).toBe(true);

    await store.close();
  });

  it("manages Q&A, native sources, details, resync and deletion", async () => {
    const { app, store, db, brand, auth } = await setupKbApiTest();

    const qaRes = await app.request("/api/v1/kb/sources/qa", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        title: "Refund requests",
        questions: ["How do I request a refund?", "Can I get my money back?"],
        answer: "Open a support request within 30 days.",
      }),
    });
    expect(qaRes.status).toBe(201);
    const qaBody = (await qaRes.json()) as { source: { id: string; type: string } };
    expect(qaBody.source.type).toBe("file_upload");

    const nativeRes = await app.request("/api/v1/kb/sources/native", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, type: "feedback", enabled: false }),
    });
    expect(nativeRes.status).toBe(200);
    const nativeBody = (await nativeRes.json()) as { source: { id: string; status: string } };
    expect(nativeBody.source.status).toBe("disabled");

    const enableNativeRes = await app.request("/api/v1/kb/sources/native", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, type: "feedback", enabled: true }),
    });
    expect(enableNativeRes.status).toBe(200);
    const enabledNative = (await enableNativeRes.json()) as {
      source: { id: string; status: string };
    };
    expect(enabledNative.source.status).toBe("active");

    const detailRes = await app.request(`/api/v1/kb/sources/${qaBody.source.id}`, {
      headers: auth,
    });
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as { documents: Array<{ title: string }> };
    expect(detailBody.documents[0]?.title).toBe("Refund requests");

    const disableRes = await app.request(`/api/v1/kb/sources/${qaBody.source.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(disableRes.status).toBe(200);

    const syncDisabledRes = await app.request(`/api/v1/kb/sources/${qaBody.source.id}/sync`, {
      method: "POST",
      headers: auth,
    });
    expect(syncDisabledRes.status).toBe(400);

    const deleteRes = await app.request(`/api/v1/kb/sources/${qaBody.source.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleteRes.status).toBe(200);

    const [deleted] = await db.select().from(kbSources).where(eq(kbSources.id, qaBody.source.id));
    expect(deleted).toBeUndefined();

    await store.close();
  });

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

    const telemetryRes = await app.request(
      `/api/v1/kb/eval/telemetry?brandId=${brand.id}&minFeedbackRate=1&p95LatencyMsMax=500`,
      { headers: auth },
    );
    expect(telemetryRes.status).toBe(200);
    const telemetryBody = (await telemetryRes.json()) as {
      report: { totalQueries: number; feedbackCoverageRate: number; evidenceStatus: string };
    };
    expect(telemetryBody.report.totalQueries).toBe(1);
    expect(telemetryBody.report.feedbackCoverageRate).toBe(1);
    expect(telemetryBody.report.evidenceStatus).toBe("passed");

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

  it("accepts signed GitHub source webhooks and triggers source ingest", async () => {
    const { app, store, db, org, brand } = await setupKbApiTest();
    const secret = "github-webhook-secret";
    const [sourceRow] = await db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "github",
        name: "GitHub Docs",
        config: {
          webhookSecret: secret,
          files: [
            {
              url: "https://raw.githubusercontent.com/acme/docs/main/README.md",
              title: "README",
              updatedAt: "2026-07-09T00:00:00.000Z",
            },
          ],
        },
      })
      .returning();
    const source = requireRow(sourceRow, "source");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("# README\n\nGitHub webhook content is indexed.", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      })) as unknown as typeof fetch;

    const rawBody = JSON.stringify({
      commits: [
        {
          timestamp: "2026-07-09T00:00:00.000Z",
          modified: ["README.md"],
        },
      ],
    });
    const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

    try {
      const res = await app.request(`/api/v1/kb/sources/${source.id}/webhook/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-github-event": "push",
          "x-github-delivery": "delivery-1",
          "x-hub-signature-256": signature,
        },
        body: rawBody,
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as {
        accepted: boolean;
        event: { eventType: string; refs: Array<{ externalId: string }> };
      };
      expect(body.accepted).toBe(true);
      expect(body.event.eventType).toBe("push");
      expect(body.event.refs).toEqual([expect.objectContaining({ externalId: "README.md" })]);

      const [updated] = await db.select().from(kbSources).where(eq(kbSources.id, source.id));
      expect(updated?.status).toBe("active");
      expect(updated?.documentCount).toBe(1);
      expect(updated?.chunkCount).toBeGreaterThan(0);

      const invalidRes = await app.request(`/api/v1/kb/sources/${source.id}/webhook/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-github-event": "push",
          "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
        },
        body: rawBody,
      });
      expect(invalidRes.status).toBe(401);
    } finally {
      globalThis.fetch = originalFetch;
      await store.close();
    }
  });
});
