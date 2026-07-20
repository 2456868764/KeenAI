import { zValidator } from "@hono/zod-validator";
import {
  KbSourceWebhookError,
  type KbSourceWebhookResult,
  buildKbTelemetryReport,
  computeKbEvalMetrics,
  createBgeM3KbQueryEmbedder,
  createKbQueryLog,
  enrichKbEvalMetricsFromGolden,
  handleKbSourceWebhook,
  promoteKbQueryLogToGolden,
  runKbGoldenEval,
  searchKbChunks,
  setKbQueryLogFeedback,
} from "@keenai/kb";
import {
  API_VERSION,
  kbEvalMetricsQuerySchema,
  kbEvalRunSchema,
  kbGoldenPromoteSchema,
  kbSearchFeedbackSchema,
  kbSearchQuerySchema,
  kbTelemetryQuerySchema,
} from "@keenai/shared";
import type { Store } from "@keenai/storage";
import {
  kbChunkVectors,
  kbChunks,
  kbDocuments,
  kbQueryLogs,
  kbSources,
} from "@keenai/storage/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { canAccessBrand } from "../lib/conversations.js";
import { getKbChunkFtsStore } from "../lib/kb-chunk-fts-init.js";
import { getKbChunkVectorStore } from "../lib/kb-chunk-vector-init.js";
import { getKbDispatch } from "../lib/kb-dispatch-init.js";
import { getKbReranker } from "../lib/kb-search-config.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

const kbSourceListQuerySchema = z.object({
  brandId: z.string().min(1),
});

const kbFileUploadSourceSchema = z.object({
  brandId: z.string().min(1),
  documents: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        fileName: z.string().trim().min(1).max(240),
        contentType: z.string().trim().min(1).max(180),
        sizeBytes: z.number().int().nonnegative().optional(),
        rawContent: z.string().min(1),
      }),
    )
    .min(1)
    .max(25),
});

const kbWebCrawlSourceSchema = z.object({
  brandId: z.string().min(1),
  mode: z.enum(["crawl_links", "individual_links"]).default("crawl_links"),
  urls: z.array(z.string().trim().url()).min(1).max(100),
  title: z.string().trim().max(180).optional(),
  includePaths: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  excludePaths: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

const kbQaSourceSchema = z.object({
  brandId: z.string().min(1),
  title: z.string().trim().min(1).max(180),
  questions: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  answer: z.string().trim().min(1).max(20_000),
});

const kbNativeSourceSchema = z.object({
  brandId: z.string().min(1),
  type: z.enum(["changelog", "feedback", "help_center"]),
  enabled: z.boolean(),
});

const kbSourceStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const last = parsed.pathname.split("/").filter(Boolean).at(-1);
  return last ? decodeURIComponent(last).replace(/[-_]+/g, " ") : parsed.hostname;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function firstHost(urls: string[]): string {
  try {
    return new URL(urls[0] ?? "").hostname;
  } catch {
    return "Website";
  }
}

function fileSourceName(documents: Array<{ title: string }>): string {
  if (documents.length === 1) return documents[0]?.title ?? "Uploaded file";
  return `${documents.length} uploaded files`;
}

function qaMarkdown(input: { title: string; questions: string[]; answer: string }): string {
  return [
    `# ${input.title}`,
    "## Questions",
    ...input.questions.map((question) => `- ${question}`),
    "## Answer",
    input.answer,
  ].join("\n\n");
}

async function getOwnedSource(db: Store["db"], input: { orgId: string; sourceId: string }) {
  const [source] = await db
    .select()
    .from(kbSources)
    .where(and(eq(kbSources.id, input.sourceId), eq(kbSources.orgId, input.orgId)))
    .limit(1);
  return source ?? null;
}

async function enqueueSourceIngest(input: { orgId: string; brandId: string; sourceId: string }) {
  await getKbDispatch().enqueueSourceIngest(input);
}

async function deleteKbSourceTree(db: Store["db"], input: { orgId: string; sourceId: string }) {
  const documents = await db
    .select({ id: kbDocuments.id })
    .from(kbDocuments)
    .where(and(eq(kbDocuments.orgId, input.orgId), eq(kbDocuments.sourceId, input.sourceId)));
  const documentIds = documents.map((document) => document.id);

  let chunkIds: string[] = [];
  if (documentIds.length > 0) {
    const chunks = await db
      .select({ id: kbChunks.id })
      .from(kbChunks)
      .where(inArray(kbChunks.documentId, documentIds));
    chunkIds = chunks.map((chunk) => chunk.id);
  }

  if (chunkIds.length > 0) {
    await getKbChunkFtsStore()?.deleteByIds(chunkIds);
    await db.delete(kbChunkVectors).where(inArray(kbChunkVectors.chunkId, chunkIds));
    await db.delete(kbChunks).where(inArray(kbChunks.id, chunkIds));
  }

  if (documentIds.length > 0) {
    await db.delete(kbDocuments).where(inArray(kbDocuments.id, documentIds));
  }

  await db.delete(kbSources).where(eq(kbSources.id, input.sourceId));
}

export function kbRoutes(_ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/kb`;

  r.post(`${prefix}/sources/:sourceId/webhook/:provider`, async (c) => {
    const sourceId = c.req.param("sourceId");
    const provider = c.req.param("provider");
    if (provider !== "github" && provider !== "notion") {
      return c.json({ error: "unsupported_kb_webhook_provider" }, 400);
    }

    const db = c.get("store").db;
    const [source] = await db.select().from(kbSources).where(eq(kbSources.id, sourceId)).limit(1);
    if (!source) return c.json({ error: "kb_source_not_found" }, 404);
    if (source.type !== provider) return c.json({ error: "kb_source_provider_mismatch" }, 400);
    if (!source.brandId) return c.json({ error: "kb_source_brand_missing" }, 400);

    let event: KbSourceWebhookResult;
    try {
      event = handleKbSourceWebhook({
        provider,
        headers: c.req.raw.headers,
        rawBody: await c.req.text(),
        config: source.config,
      });
    } catch (error) {
      if (error instanceof KbSourceWebhookError) {
        const status = error.status === 401 ? 401 : error.status === 400 ? 400 : 500;
        return c.json({ error: error.code }, status);
      }
      throw error;
    }

    if (event.action === "ignored") {
      return c.json({ accepted: false, sourceId, event }, 202);
    }

    await getKbDispatch().enqueueSourceIngest({
      orgId: source.orgId,
      brandId: source.brandId,
      sourceId,
    });

    return c.json({ accepted: true, sourceId, event }, 202);
  });

  r.get(
    `${prefix}/sources`,
    requireAuth(),
    zValidator("query", kbSourceListQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const rows = await c
        .get("store")
        .db.select({
          id: kbSources.id,
          type: kbSources.type,
          name: kbSources.name,
          status: kbSources.status,
          syncStrategy: kbSources.syncStrategy,
          config: kbSources.config,
          lastSyncedAt: kbSources.lastSyncedAt,
          error: kbSources.error,
          documentCount: kbSources.documentCount,
          chunkCount: kbSources.chunkCount,
          createdAt: kbSources.createdAt,
          updatedAt: kbSources.updatedAt,
        })
        .from(kbSources)
        .where(and(eq(kbSources.orgId, auth.orgId), eq(kbSources.brandId, query.brandId)))
        .orderBy(desc(kbSources.updatedAt));

      return c.json({ items: rows });
    },
  );

  r.post(
    `${prefix}/sources/file-upload`,
    requireAuth(),
    zValidator("json", kbFileUploadSourceSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const now = new Date();
      const documents = body.documents.map((document, index) => ({
        externalId: `${Date.now().toString(36)}-${index}-${document.fileName}`,
        title: document.title,
        url: `file://${document.fileName}`,
        rawContent: document.rawContent,
        contentType: document.contentType,
        updatedAt: now.toISOString(),
        attachments: [
          {
            filename: document.fileName,
            mime: document.contentType,
            url: `file://${document.fileName}`,
            bytes: document.sizeBytes ?? Buffer.byteLength(document.rawContent, "utf8"),
          },
        ],
      }));
      const [source] = await c
        .get("store")
        .db.insert(kbSources)
        .values({
          orgId: auth.orgId,
          brandId: body.brandId,
          type: "file_upload",
          name: fileSourceName(body.documents),
          status: "syncing",
          syncStrategy: "manual",
          createdBy: auth.sub,
          config: {
            sourceKind: "file",
            documents,
          },
        })
        .returning();

      if (!source) throw new Error("kb_source_create_failed");

      await enqueueSourceIngest({
        orgId: auth.orgId,
        brandId: body.brandId,
        sourceId: source.id,
      });

      return c.json({ source }, 201);
    },
  );

  r.post(
    `${prefix}/sources/web-crawl`,
    requireAuth(),
    zValidator("json", kbWebCrawlSourceSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const urls = uniqueStrings(body.urls);
      const title =
        body.title?.trim() || (urls.length === 1 ? titleFromUrl(urls[0] ?? "") : firstHost(urls));
      const now = new Date();
      const [source] = await c
        .get("store")
        .db.insert(kbSources)
        .values({
          orgId: auth.orgId,
          brandId: body.brandId,
          type: "web_crawl",
          name: title,
          status: "syncing",
          syncStrategy: "manual",
          createdBy: auth.sub,
          config: {
            sourceKind: "website",
            crawlMode: body.mode,
            includePaths: uniqueStrings(body.includePaths ?? []),
            excludePaths: uniqueStrings(body.excludePaths ?? []),
            urls: urls.map((url) => ({
              url,
              title: urls.length === 1 ? title : titleFromUrl(url),
              updatedAt: now.toISOString(),
            })),
          },
        })
        .returning();

      if (!source) throw new Error("kb_source_create_failed");

      await enqueueSourceIngest({
        orgId: auth.orgId,
        brandId: body.brandId,
        sourceId: source.id,
      });

      return c.json({ source }, 201);
    },
  );

  r.post(`${prefix}/sources/qa`, requireAuth(), zValidator("json", kbQaSourceSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    if (!canAccessBrand(auth, body.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const now = new Date();
    const [source] = await c
      .get("store")
      .db.insert(kbSources)
      .values({
        orgId: auth.orgId,
        brandId: body.brandId,
        type: "file_upload",
        name: body.title,
        status: "syncing",
        syncStrategy: "manual",
        createdBy: auth.sub,
        config: {
          sourceKind: "qa",
          questions: body.questions,
          answer: body.answer,
          documents: [
            {
              externalId: `qa-${Date.now().toString(36)}`,
              title: body.title,
              rawContent: qaMarkdown(body),
              contentType: "text/markdown",
              updatedAt: now.toISOString(),
            },
          ],
        },
      })
      .returning();

    if (!source) throw new Error("kb_source_create_failed");

    await enqueueSourceIngest({
      orgId: auth.orgId,
      brandId: body.brandId,
      sourceId: source.id,
    });

    return c.json({ source }, 201);
  });

  r.post(
    `${prefix}/sources/native`,
    requireAuth(),
    zValidator("json", kbNativeSourceSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const db = c.get("store").db;
      const existing = await db
        .select()
        .from(kbSources)
        .where(
          and(
            eq(kbSources.orgId, auth.orgId),
            eq(kbSources.brandId, body.brandId),
            eq(kbSources.type, body.type),
          ),
        )
        .limit(1);
      const now = new Date();
      const status = body.enabled ? "active" : "disabled";
      let source = existing[0] ?? null;

      if (source) {
        const [updated] = await db
          .update(kbSources)
          .set({
            status,
            error: null,
            updatedAt: now,
            config: {
              ...(source.config ?? {}),
              sourceKind: "native",
            },
          })
          .where(eq(kbSources.id, source.id))
          .returning();
        source = updated ?? source;
      } else {
        const [created] = await db
          .insert(kbSources)
          .values({
            orgId: auth.orgId,
            brandId: body.brandId,
            type: body.type,
            name:
              body.type === "help_center"
                ? "Help center portal"
                : body.type === "feedback"
                  ? "Feedback portal"
                  : "Updates portal",
            status,
            syncStrategy: "manual",
            createdBy: auth.sub,
            config: { sourceKind: "native" },
          })
          .returning();
        source = created ?? null;
      }

      if (!source) throw new Error("kb_source_upsert_failed");
      return c.json({ source });
    },
  );

  r.get(`${prefix}/sources/:sourceId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const source = await getOwnedSource(c.get("store").db, {
      orgId: auth.orgId,
      sourceId: c.req.param("sourceId"),
    });
    if (!source) return c.json({ error: "kb_source_not_found" }, 404);
    if (!source.brandId || !canAccessBrand(auth, source.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const documents = await c
      .get("store")
      .db.select({
        id: kbDocuments.id,
        title: kbDocuments.title,
        url: kbDocuments.url,
        status: kbDocuments.status,
        contentType: kbDocuments.contentType,
        indexedAt: kbDocuments.indexedAt,
        updatedAt: kbDocuments.updatedAt,
      })
      .from(kbDocuments)
      .where(
        and(
          eq(kbDocuments.orgId, auth.orgId),
          eq(kbDocuments.brandId, source.brandId),
          eq(kbDocuments.sourceId, source.id),
        ),
      )
      .orderBy(desc(kbDocuments.updatedAt));

    return c.json({ source, documents });
  });

  r.patch(
    `${prefix}/sources/:sourceId`,
    requireAuth(),
    zValidator("json", kbSourceStatusSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const source = await getOwnedSource(c.get("store").db, {
        orgId: auth.orgId,
        sourceId: c.req.param("sourceId"),
      });
      if (!source) return c.json({ error: "kb_source_not_found" }, 404);
      if (!source.brandId || !canAccessBrand(auth, source.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const body = c.req.valid("json");
      const [updated] = await c
        .get("store")
        .db.update(kbSources)
        .set({ status: body.status, error: null, updatedAt: new Date() })
        .where(eq(kbSources.id, source.id))
        .returning();

      if (body.status === "active") {
        await enqueueSourceIngest({
          orgId: auth.orgId,
          brandId: source.brandId,
          sourceId: source.id,
        });
      }

      return c.json({ source: updated ?? source });
    },
  );

  r.post(`${prefix}/sources/:sourceId/sync`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const source = await getOwnedSource(c.get("store").db, {
      orgId: auth.orgId,
      sourceId: c.req.param("sourceId"),
    });
    if (!source) return c.json({ error: "kb_source_not_found" }, 404);
    if (!source.brandId || !canAccessBrand(auth, source.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (source.status === "disabled") {
      return c.json({ error: "kb_source_disabled" }, 400);
    }

    await c
      .get("store")
      .db.update(kbSources)
      .set({ status: "syncing", error: null, updatedAt: new Date() })
      .where(eq(kbSources.id, source.id));
    await enqueueSourceIngest({
      orgId: auth.orgId,
      brandId: source.brandId,
      sourceId: source.id,
    });

    const updated = await getOwnedSource(c.get("store").db, {
      orgId: auth.orgId,
      sourceId: source.id,
    });
    return c.json({ source: updated ?? source });
  });

  r.delete(`${prefix}/sources/:sourceId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const source = await getOwnedSource(c.get("store").db, {
      orgId: auth.orgId,
      sourceId: c.req.param("sourceId"),
    });
    if (!source) return c.json({ error: "kb_source_not_found" }, 404);
    if (!source.brandId || !canAccessBrand(auth, source.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    await deleteKbSourceTree(c.get("store").db, { orgId: auth.orgId, sourceId: source.id });
    return c.json({ ok: true, sourceId: source.id });
  });

  r.get(`${prefix}/search`, requireAuth(), zValidator("query", kbSearchQuerySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const query = c.req.valid("query");
    if (!canAccessBrand(auth, query.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const chunkFts = getKbChunkFtsStore();
    if (!chunkFts) {
      return c.json({ error: "kb_fts_unavailable" }, 503);
    }

    const rerank = query.rerank !== false;
    const db = c.get("store").db;
    const startedAt = performance.now();
    const results = await searchKbChunks(db, {
      orgId: auth.orgId,
      brandId: query.brandId,
      q: query.q,
      limit: query.limit,
      chunkFts,
      chunkVector: getKbChunkVectorStore(),
      queryEmbedder: createBgeM3KbQueryEmbedder(),
      rerank,
      reranker: rerank ? getKbReranker() : null,
    });
    const latencyMs = performance.now() - startedAt;

    const log = await createKbQueryLog(db, {
      orgId: auth.orgId,
      brandId: query.brandId,
      queryText: query.q,
      hits: results.hits,
      latencyMs,
    });

    return c.json({ results, logId: log.id });
  });

  r.post(
    `${prefix}/search/:id/feedback`,
    requireAuth(),
    zValidator("json", kbSearchFeedbackSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const logId = c.req.param("id");
      const body = c.req.valid("json");
      const db = c.get("store").db;

      const [existing] = await db
        .select({ brandId: kbQueryLogs.brandId })
        .from(kbQueryLogs)
        .where(and(eq(kbQueryLogs.id, logId), eq(kbQueryLogs.orgId, auth.orgId)));

      if (!existing) return c.json({ error: "not_found" }, 404);
      if (existing.brandId && !canAccessBrand(auth, existing.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const updated = await setKbQueryLogFeedback(db, {
        orgId: auth.orgId,
        logId,
        feedback: body.feedback,
      });
      if (!updated) return c.json({ error: "not_found" }, 404);

      return c.json({ ok: true, logId, feedback: body.feedback });
    },
  );

  r.get(
    `${prefix}/eval/metrics`,
    requireAuth(),
    zValidator("query", kbEvalMetricsQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const db = c.get("store").db;
      let metrics = await computeKbEvalMetrics(db, {
        orgId: auth.orgId,
        brandId: query.brandId,
        since: query.since ? new Date(query.since) : undefined,
      });

      if (query.includeGolden) {
        const chunkFts = getKbChunkFtsStore();
        if (chunkFts) {
          const golden = await runKbGoldenEval(db, {
            orgId: auth.orgId,
            brandId: query.brandId,
            search: {
              chunkFts,
              chunkVector: getKbChunkVectorStore(),
              queryEmbedder: createBgeM3KbQueryEmbedder(),
              rerank: true,
              reranker: getKbReranker(),
            },
          });
          metrics = enrichKbEvalMetricsFromGolden(metrics, golden);
        }
      }

      return c.json({ metrics });
    },
  );

  r.get(
    `${prefix}/eval/telemetry`,
    requireAuth(),
    zValidator("query", kbTelemetryQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const report = await buildKbTelemetryReport(c.get("store").db, {
        orgId: auth.orgId,
        brandId: query.brandId,
        since: query.since ? new Date(query.since) : undefined,
        until: query.until ? new Date(query.until) : undefined,
        topFailuresLimit: query.topFailuresLimit,
        thresholds: {
          minQueries: query.minQueries,
          minFeedbackRate: query.minFeedbackRate,
          staleAnswerRateMax: query.staleAnswerRateMax,
          p95LatencyMsMax: query.p95LatencyMsMax,
        },
      });

      return c.json({ report });
    },
  );

  r.post(
    `${prefix}/eval/golden`,
    requireAuth(),
    zValidator("json", kbGoldenPromoteSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const result = await promoteKbQueryLogToGolden(c.get("store").db, {
          orgId: auth.orgId,
          brandId: body.brandId,
          queryLogId: body.queryLogId,
          expectedChunkIds: body.expectedChunkIds,
          expectedAnswer: body.expectedAnswer,
          tags: body.tags,
          createdBy: auth.sub,
        });
        return c.json(result, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "promote_failed";
        if (message === "kb_query_log_not_found") return c.json({ error: message }, 404);
        if (message === "kb_query_log_not_failed") return c.json({ error: message }, 400);
        return c.json({ error: message }, 500);
      }
    },
  );

  r.post(`${prefix}/eval/run`, requireAuth(), zValidator("json", kbEvalRunSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    if (!canAccessBrand(auth, body.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const chunkFts = getKbChunkFtsStore();
    if (!chunkFts) {
      return c.json({ error: "kb_fts_unavailable" }, 503);
    }

    const rerank = body.rerank !== false;
    const report = await runKbGoldenEval(c.get("store").db, {
      orgId: auth.orgId,
      brandId: body.brandId,
      maxCases: body.maxCases,
      search: {
        chunkFts,
        chunkVector: getKbChunkVectorStore(),
        queryEmbedder: createBgeM3KbQueryEmbedder(),
        rerank,
        reranker: rerank ? getKbReranker() : null,
      },
    });

    return c.json({ report });
  });

  return r;
}
