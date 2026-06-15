import { zValidator } from "@hono/zod-validator";
import {
  createBgeM3KbQueryEmbedder,
  createKbQueryLog,
  searchKbChunks,
  setKbQueryLogFeedback,
} from "@keenai/kb";
import {
  API_VERSION,
  kbSearchFeedbackSchema,
  kbSearchQuerySchema,
  publicKbAnswerQuerySchema,
} from "@keenai/shared";
import { kbQueryLogs } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getFeedbackBoardBySlug, listFeedbackPosts } from "../lib/feedback.js";
import { preparePublicKbAnswerStream } from "../lib/kb-answer-stream.js";
import { getKbChunkFtsStore } from "../lib/kb-chunk-fts-init.js";
import { getKbChunkVectorStore } from "../lib/kb-chunk-vector-init.js";
import {
  getPublicKbArticle,
  listPublicKbArticles,
  listPublicKbCollections,
} from "../lib/kb-public.js";
import { getKbReranker } from "../lib/kb-search-config.js";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import { getRoadmapBySlug, listRoadmapItems } from "../lib/roadmap.js";
import type { AppContext, AppVariables } from "../types.js";

export function publicRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/public`;

  r.get(`${prefix}/:orgSlug/meta`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      c.req.query("brand") ?? "default",
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    return c.json({
      org: {
        id: resolved.org.id,
        slug: resolved.org.slug,
        name: resolved.org.name,
      },
      brand: {
        id: resolved.brand.id,
        slug: resolved.brand.slug,
        name: resolved.brand.name,
      },
    });
  });

  r.get(`${prefix}/:orgSlug/kb/search`, zValidator("query", kbSearchQuerySchema), async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const orgSlug = c.req.param("orgSlug");
    const brandSlug = c.req.query("brand") ?? "default";
    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const query = c.req.valid("query");
    if (query.brandId !== resolved.brand.id) {
      return c.json({ error: "brand_mismatch" }, 400);
    }

    const chunkFts = getKbChunkFtsStore();
    if (!chunkFts) return c.json({ error: "kb_fts_unavailable" }, 503);

    const db = c.get("store").db;
    const startedAt = performance.now();
    const results = await searchKbChunks(db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      q: query.q,
      limit: query.limit,
      chunkFts,
      chunkVector: getKbChunkVectorStore(),
      queryEmbedder: createBgeM3KbQueryEmbedder(),
      rerank: query.rerank !== false,
      reranker: query.rerank !== false ? getKbReranker() : null,
    });
    const latencyMs = performance.now() - startedAt;

    const log = await createKbQueryLog(db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      queryText: query.q,
      hits: results.hits,
      latencyMs,
    });

    return c.json({
      results: {
        hits: results.hits.map((hit) => ({
          chunkId: hit.chunkId,
          documentTitle: hit.documentTitle,
          snippet: hit.snippet ?? hit.content,
          fusedScore: hit.fusedScore,
        })),
      },
      logId: log.id,
    });
  });

  r.get(
    `${prefix}/:orgSlug/kb/answer`,
    zValidator("query", publicKbAnswerQuerySchema),
    async (c) => {
      if (!ctx.env.PORTAL_PUBLIC_READ) {
        return c.json({ error: "public_read_disabled" }, 403);
      }

      const resolved = await resolveOrgBrandBySlug(
        c.get("store").db,
        c.req.param("orgSlug"),
        c.req.query("brand") ?? "default",
      );
      if ("error" in resolved) return c.json({ error: resolved.error }, 404);

      const query = c.req.valid("query");
      if (query.brandId !== resolved.brand.id) {
        return c.json({ error: "brand_mismatch" }, 400);
      }

      const prepared = await preparePublicKbAnswerStream(c.get("store").db, ctx.env, {
        orgId: resolved.org.id,
        brandId: resolved.brand.id,
        q: query.q,
        limit: query.limit,
        rerank: query.rerank !== false,
      });

      if ("error" in prepared) {
        const status = prepared.error === "kb_fts_unavailable" ? 503 : 503;
        return c.json({ error: prepared.error }, status);
      }

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          event: "meta",
          data: JSON.stringify({
            logId: prepared.logId,
            providerId: prepared.providerId,
            citations: prepared.citations,
          }),
        });

        for await (const chunk of prepared.stream) {
          if (chunk.type === "text-delta") {
            await stream.writeSSE({ data: JSON.stringify({ text: chunk.text }) });
          }
        }

        await stream.writeSSE({ event: "done", data: "{}" });
      });
    },
  );

  r.post(
    `${prefix}/:orgSlug/kb/search/:id/feedback`,
    zValidator("json", kbSearchFeedbackSchema),
    async (c) => {
      if (!ctx.env.PORTAL_PUBLIC_READ) {
        return c.json({ error: "public_read_disabled" }, 403);
      }

      const resolved = await resolveOrgBrandBySlug(
        c.get("store").db,
        c.req.param("orgSlug"),
        c.req.query("brand") ?? "default",
      );
      if ("error" in resolved) return c.json({ error: resolved.error }, 404);

      const logId = c.req.param("id");
      const body = c.req.valid("json");
      const db = c.get("store").db;

      const [existing] = await db
        .select({ id: kbQueryLogs.id })
        .from(kbQueryLogs)
        .where(and(eq(kbQueryLogs.id, logId), eq(kbQueryLogs.orgId, resolved.org.id)))
        .limit(1);

      if (!existing) return c.json({ error: "not_found" }, 404);

      const updated = await setKbQueryLogFeedback(db, {
        orgId: resolved.org.id,
        logId,
        feedback: body.feedback,
      });

      return c.json({ ok: Boolean(updated) });
    },
  );

  r.get(`${prefix}/:orgSlug/kb/collections`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      c.req.query("brand") ?? "default",
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const items = await listPublicKbCollections(
      c.get("store").db,
      resolved.org.id,
      resolved.brand.id,
    );
    return c.json({ items });
  });

  r.get(`${prefix}/:orgSlug/kb/articles`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      c.req.query("brand") ?? "default",
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const collection = c.req.query("collection") ?? undefined;
    const items = await listPublicKbArticles(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      collection,
    });
    return c.json({ items });
  });

  r.get(`${prefix}/:orgSlug/kb/articles/:id`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      c.req.query("brand") ?? "default",
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const article = await getPublicKbArticle(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      articleId: c.req.param("id"),
    });
    if (!article) return c.json({ error: "not_found" }, 404);
    return c.json({ article });
  });

  r.get(`${prefix}/:orgSlug/feedback/:boardSlug/posts`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      c.req.query("brand") ?? "default",
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const board = await getFeedbackBoardBySlug(
      c.get("store").db,
      resolved.org.id,
      c.req.param("boardSlug"),
    );
    if (!board || !board.public) return c.json({ error: "not_found" }, 404);

    const items = await listFeedbackPosts(c.get("store").db, board.id, resolved.org.id, 50);
    return c.json({ board: { slug: board.slug, name: board.name }, items });
  });

  r.get(`${prefix}/:orgSlug/roadmap/:roadmapSlug/items`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "public_read_disabled" }, 403);
    }

    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      c.req.query("brand") ?? "default",
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const roadmap = await getRoadmapBySlug(
      c.get("store").db,
      resolved.org.id,
      c.req.param("roadmapSlug"),
    );
    if (!roadmap || !roadmap.public || roadmap.brandId !== resolved.brand.id) {
      return c.json({ error: "not_found" }, 404);
    }

    const items = await listRoadmapItems(c.get("store").db, roadmap.id, resolved.org.id);
    return c.json({
      roadmap: {
        slug: roadmap.slug,
        name: roadmap.name,
        columns: roadmap.columns,
      },
      items,
    });
  });

  return r;
}
