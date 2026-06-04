import { zValidator } from "@hono/zod-validator";
import { createBgeM3KbQueryEmbedder, searchKbChunks } from "@keenai/kb";
import { API_VERSION, kbSearchQuerySchema } from "@keenai/shared";
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
    const results = await searchKbChunks(c.get("store").db, {
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

    return c.json({ results });
  });

  return r;
}
