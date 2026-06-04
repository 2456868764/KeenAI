import { zValidator } from "@hono/zod-validator";
import {
  createBgeM3KbQueryEmbedder,
  createKbQueryLog,
  searchKbChunks,
  setKbQueryLogFeedback,
} from "@keenai/kb";
import { API_VERSION, kbSearchFeedbackSchema, kbSearchQuerySchema } from "@keenai/shared";
import { kbQueryLogs } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { canAccessBrand } from "../lib/conversations.js";
import { getKbChunkFtsStore } from "../lib/kb-chunk-fts-init.js";
import { getKbChunkVectorStore } from "../lib/kb-chunk-vector-init.js";
import { getKbReranker } from "../lib/kb-search-config.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function kbRoutes(_ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/kb`;

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

  return r;
}
