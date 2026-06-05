import { zValidator } from "@hono/zod-validator";
import { indexKbDocument } from "@keenai/kb";
import {
  API_VERSION,
  createHelpArticleSchema,
  createHelpCollectionSchema,
  listHelpArticlesSchema,
  updateHelpArticleSchema,
} from "@keenai/shared";
import { Hono } from "hono";
import { assertBrandInOrg, canAccessBrand } from "../lib/conversations.js";
import {
  createHelpArticle,
  createHelpCollection,
  ensureDefaultHelpCollection,
  getHelpArticleById,
  listHelpArticles,
  listHelpCollections,
  syncHelpArticleToKb,
  updateHelpArticle,
} from "../lib/help-center.js";
import { getKbChunkFtsStore } from "../lib/kb-chunk-fts-init.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function helpCenterRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/help-center`;

  r.get(`${prefix}/collections`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const brandId = c.req.query("brandId");
    if (!brandId) return c.json({ error: "missing_brand_id" }, 400);
    if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);

    const brand = await assertBrandInOrg(c.get("store").db, brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const items = await listHelpCollections(c.get("store").db, auth.orgId, brandId);
    return c.json({ items });
  });

  r.post(
    `${prefix}/collections`,
    requireAuth(),
    zValidator("json", createHelpCollectionSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) return c.json({ error: "forbidden" }, 403);

      const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      try {
        const collection = await createHelpCollection(c.get("store").db, {
          orgId: auth.orgId,
          ...body,
        });
        return c.json({ collection }, 201);
      } catch {
        return c.json({ error: "slug_conflict" }, 409);
      }
    },
  );

  r.post(`${prefix}/collections/ensure-default`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const brandId = c.req.query("brandId");
    if (!brandId) return c.json({ error: "missing_brand_id" }, 400);
    if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);

    const brand = await assertBrandInOrg(c.get("store").db, brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const collection = await ensureDefaultHelpCollection(c.get("store").db, auth.orgId, brandId);
    return c.json({ collection });
  });

  r.get(
    `${prefix}/articles`,
    requireAuth(),
    zValidator("query", listHelpArticlesSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) return c.json({ error: "forbidden" }, 403);

      const brand = await assertBrandInOrg(c.get("store").db, query.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      const items = await listHelpArticles(c.get("store").db, {
        orgId: auth.orgId,
        brandId: query.brandId,
        collectionId: query.collectionId,
        status: query.status,
        limit: query.limit,
      });
      return c.json({ items });
    },
  );

  r.get(`${prefix}/articles/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const article = await getHelpArticleById(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!article) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, article.brandId)) return c.json({ error: "forbidden" }, 403);

    return c.json({ article });
  });

  r.post(
    `${prefix}/articles`,
    requireAuth(),
    zValidator("json", createHelpArticleSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) return c.json({ error: "forbidden" }, 403);

      const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      try {
        const article = await createHelpArticle(c.get("store").db, {
          orgId: auth.orgId,
          authorMemberId: auth.memberId,
          ...body,
        });
        return c.json({ article }, 201);
      } catch {
        return c.json({ error: "slug_conflict" }, 409);
      }
    },
  );

  r.patch(
    `${prefix}/articles/:id`,
    requireAuth(),
    zValidator("json", updateHelpArticleSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const existing = await getHelpArticleById(c.get("store").db, auth.orgId, c.req.param("id"));
      if (!existing) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, existing.brandId)) return c.json({ error: "forbidden" }, 403);

      const body = c.req.valid("json");
      try {
        const article = await updateHelpArticle(c.get("store").db, {
          orgId: auth.orgId,
          id: c.req.param("id"),
          patch: body,
        });
        if (!article) return c.json({ error: "not_found" }, 404);

        if (article.status === "published") {
          const documentId = await syncHelpArticleToKb(c.get("store").db, auth.orgId, article.id);
          const chunkFts = getKbChunkFtsStore();
          if (documentId && chunkFts) {
            await indexKbDocument(c.get("store").db, {
              orgId: auth.orgId,
              brandId: article.brandId,
              documentId,
              chunkFtsIndexer: chunkFts,
            });
          }
          const refreshed = await getHelpArticleById(c.get("store").db, auth.orgId, article.id);
          return c.json({ article: refreshed ?? article });
        }

        return c.json({ article });
      } catch {
        return c.json({ error: "slug_conflict" }, 409);
      }
    },
  );

  return r;
}
