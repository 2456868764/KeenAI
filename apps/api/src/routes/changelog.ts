import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createChangelogEntrySchema,
  listChangelogEntriesSchema,
  updateChangelogEntrySchema,
} from "@keenai/shared";
import { Hono } from "hono";
import {
  createChangelogEntry,
  deleteChangelogEntry,
  getChangelogEntryById,
  isUniqueConstraintError,
  listChangelogEntries,
  updateChangelogEntry,
} from "../lib/changelog.js";
import { assertBrandInOrg, canAccessBrand } from "../lib/conversations.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function changelogRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/changelog`;

  r.get(
    `${prefix}/entries`,
    requireAuth(),
    zValidator("query", listChangelogEntriesSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) return c.json({ error: "forbidden" }, 403);

      const brand = await assertBrandInOrg(c.get("store").db, query.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      const items = await listChangelogEntries(c.get("store").db, auth.orgId, query.brandId, {
        status: query.status,
        limit: query.limit,
      });
      return c.json({ items });
    },
  );

  r.post(
    `${prefix}/entries`,
    requireAuth(),
    zValidator("json", createChangelogEntrySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) return c.json({ error: "forbidden" }, 403);

      const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      try {
        const entry = await createChangelogEntry(c.get("store").db, {
          orgId: auth.orgId,
          brandId: body.brandId,
          slug: body.slug,
          title: body.title,
          summary: body.summary,
          content: body.content,
          plainText: body.plainText,
          categoryTags: body.categoryTags,
          audienceFilter: body.audienceFilter,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
          authorMemberId: auth.memberId,
        });
        return c.json({ entry }, 201);
      } catch (error) {
        if (isUniqueConstraintError(error)) return c.json({ error: "slug_conflict" }, 409);
        throw error;
      }
    },
  );

  r.get(`${prefix}/entries/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const entry = await getChangelogEntryById(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!entry) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, entry.brandId)) return c.json({ error: "forbidden" }, 403);

    return c.json({ entry });
  });

  r.patch(
    `${prefix}/entries/:id`,
    requireAuth(),
    zValidator("json", updateChangelogEntrySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const existing = await getChangelogEntryById(
        c.get("store").db,
        auth.orgId,
        c.req.param("id"),
      );
      if (!existing) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, existing.brandId)) return c.json({ error: "forbidden" }, 403);

      const body = c.req.valid("json");
      try {
        const entry = await updateChangelogEntry(c.get("store").db, {
          orgId: auth.orgId,
          id: c.req.param("id"),
          patch: {
            slug: body.slug,
            title: body.title,
            summary: body.summary,
            content: body.content,
            plainText: body.plainText,
            categoryTags: body.categoryTags,
            audienceFilter: body.audienceFilter,
            status: body.status,
            scheduledAt:
              body.scheduledAt === undefined
                ? undefined
                : body.scheduledAt
                  ? new Date(body.scheduledAt)
                  : null,
          },
        });
        if (!entry) return c.json({ error: "not_found" }, 404);
        return c.json({ entry });
      } catch (error) {
        if (isUniqueConstraintError(error)) return c.json({ error: "slug_conflict" }, 409);
        throw error;
      }
    },
  );

  r.delete(`${prefix}/entries/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const existing = await getChangelogEntryById(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, existing.brandId)) return c.json({ error: "forbidden" }, 403);

    const deleted = await deleteChangelogEntry(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!deleted) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  return r;
}
