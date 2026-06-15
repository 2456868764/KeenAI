import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createRoadmapItemSchema,
  createRoadmapSchema,
  listRoadmapsQuerySchema,
  updateRoadmapItemSchema,
} from "@keenai/shared";
import { Hono } from "hono";
import { assertBrandInOrg, canAccessBrand } from "../lib/conversations.js";
import {
  createRoadmap,
  createRoadmapItem,
  deleteRoadmapItem,
  ensureDefaultRoadmap,
  getRoadmapById,
  isUniqueConstraintError,
  listRoadmapItems,
  listRoadmaps,
  updateRoadmapItem,
} from "../lib/roadmap.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function roadmapRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/roadmaps`;

  r.get(prefix, requireAuth(), zValidator("query", listRoadmapsQuerySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const query = c.req.valid("query");
    if (query.brandId && !canAccessBrand(auth, query.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const items = await listRoadmaps(c.get("store").db, auth.orgId, query.brandId);
    return c.json({ items });
  });

  r.post(prefix, requireAuth(), zValidator("json", createRoadmapSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    if (!canAccessBrand(auth, body.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    try {
      const roadmap = await createRoadmap(c.get("store").db, {
        orgId: auth.orgId,
        brandId: body.brandId,
        slug: body.slug,
        name: body.name,
        public: body.public,
        columns: body.columns,
      });
      return c.json({ roadmap }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return c.json({ error: "slug_conflict" }, 409);
      }
      throw error;
    }
  });

  r.post(`${prefix}/ensure-default`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const brandId = c.req.query("brandId");
    if (!brandId) return c.json({ error: "missing_brand_id" }, 400);
    if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);

    const brand = await assertBrandInOrg(c.get("store").db, brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const roadmap = await ensureDefaultRoadmap(c.get("store").db, auth.orgId, brandId);
    return c.json({ roadmap });
  });

  r.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const roadmap = await getRoadmapById(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!roadmap) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, roadmap.brandId)) return c.json({ error: "forbidden" }, 403);

    return c.json({ roadmap });
  });

  r.get(`${prefix}/:id/items`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const roadmap = await getRoadmapById(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!roadmap) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, roadmap.brandId)) return c.json({ error: "forbidden" }, 403);

    const items = await listRoadmapItems(c.get("store").db, roadmap.id, auth.orgId);
    return c.json({ roadmap, items });
  });

  r.post(
    `${prefix}/:id/items`,
    requireAuth(),
    zValidator("json", createRoadmapItemSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const roadmap = await getRoadmapById(c.get("store").db, auth.orgId, c.req.param("id"));
      if (!roadmap) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, roadmap.brandId)) return c.json({ error: "forbidden" }, 403);

      const item = await createRoadmapItem(c.get("store").db, {
        orgId: auth.orgId,
        roadmapId: roadmap.id,
        title: body.title,
        description: body.description,
        columnId: body.columnId,
        sortOrder: body.sortOrder,
        linkedPostId: body.linkedPostId,
        eta: body.eta ? new Date(body.eta) : undefined,
      });

      return c.json({ item }, 201);
    },
  );

  r.patch(
    `${prefix}/:id/items/:itemId`,
    requireAuth(),
    zValidator("json", updateRoadmapItemSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const roadmap = await getRoadmapById(c.get("store").db, auth.orgId, c.req.param("id"));
      if (!roadmap) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, roadmap.brandId)) return c.json({ error: "forbidden" }, 403);

      const item = await updateRoadmapItem(c.get("store").db, {
        orgId: auth.orgId,
        itemId: c.req.param("itemId"),
        title: body.title,
        description: body.description,
        columnId: body.columnId,
        sortOrder: body.sortOrder,
        linkedPostId: body.linkedPostId,
        eta: body.eta === undefined ? undefined : body.eta ? new Date(body.eta) : null,
      });

      if (!item) return c.json({ error: "not_found" }, 404);
      return c.json({ item });
    },
  );

  r.delete(`${prefix}/:id/items/:itemId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const roadmap = await getRoadmapById(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!roadmap) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, roadmap.brandId)) return c.json({ error: "forbidden" }, 403);

    const deleted = await deleteRoadmapItem(c.get("store").db, auth.orgId, c.req.param("itemId"));
    if (!deleted) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  return r;
}
