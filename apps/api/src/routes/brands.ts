import { zValidator } from "@hono/zod-validator";
import { API_VERSION, createBrandSchema, updateBrandSchema } from "@keenai/shared";
import { brands } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

function serializeBrand(row: typeof brands.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    name: row.name,
    domain: row.domain ?? null,
    logoUrl: row.logoUrl ?? null,
    locale: row.locale ?? "en",
    emailFrom: row.emailFrom ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function brandRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/brands`;

  r.get(prefix, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const rows = await c
      .get("store")
      .db.select()
      .from(brands)
      .where(eq(brands.orgId, auth.orgId))
      .orderBy(brands.name);

    return c.json({ items: rows.map(serializeBrand) });
  });

  r.post(prefix, requireAuth(), zValidator("json", createBrandSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    try {
      const [row] = await c
        .get("store")
        .db.insert(brands)
        .values({
          orgId: auth.orgId,
          slug: body.slug,
          name: body.name,
          domain: body.domain,
          locale: body.locale ?? "en",
          emailFrom: body.emailFrom,
        })
        .returning();

      if (!row) return c.json({ error: "create_failed" }, 500);
      return c.json({ brand: serializeBrand(row) }, 201);
    } catch {
      return c.json({ error: "slug_conflict" }, 409);
    }
  });

  r.patch(`${prefix}/:id`, requireAuth(), zValidator("json", updateBrandSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const [existing] = await c
      .get("store")
      .db.select()
      .from(brands)
      .where(and(eq(brands.id, c.req.param("id")), eq(brands.orgId, auth.orgId)))
      .limit(1);

    if (!existing) return c.json({ error: "not_found" }, 404);

    const [row] = await c
      .get("store")
      .db.update(brands)
      .set({
        name: body.name ?? existing.name,
        domain: body.domain === undefined ? existing.domain : body.domain,
        locale: body.locale ?? existing.locale,
        emailFrom: body.emailFrom === undefined ? existing.emailFrom : body.emailFrom,
        updatedAt: new Date(),
      })
      .where(eq(brands.id, existing.id))
      .returning();

    if (!row) return c.json({ error: "update_failed" }, 500);
    return c.json({ brand: serializeBrand(row) });
  });

  return r;
}
