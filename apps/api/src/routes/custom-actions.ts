import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  customActionBodySchema,
  executeCustomActionBodySchema,
  listCustomActionsQuerySchema,
  updateCustomActionBodySchema,
} from "@keenai/shared";
import { customActions } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { assertBrandInOrg, canAccessBrand } from "../lib/conversations.js";
import {
  executeCustomActionHttpDirect,
  resolveCustomActionSecretFromEnv,
} from "../lib/custom-action-executor.js";
import { isUniqueConstraintError, serializeCustomAction } from "../lib/custom-actions.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

function mapExecutorError(error: unknown): { status: number; error: string } | null {
  if (!(error instanceof Error)) return null;
  switch (error.message) {
    case "action_disabled":
      return { status: 400, error: error.message };
    case "sandbox_not_supported":
      return { status: 501, error: error.message };
    case "auth_secret_missing":
    case "auth_secret_unavailable":
    case "auth_type_unsupported":
      return { status: 422, error: error.message };
    case "response_too_large":
      return { status: 502, error: error.message };
    default:
      return null;
  }
}

export function customActionRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/custom-actions`;

  r.get(prefix, requireAuth(), zValidator("query", listCustomActionsQuerySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const query = c.req.valid("query");
    if (query.brandId && !canAccessBrand(auth, query.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const filters = [eq(customActions.orgId, auth.orgId)];
    if (query.brandId) filters.push(eq(customActions.brandId, query.brandId));
    if (query.enabled !== undefined) filters.push(eq(customActions.enabled, query.enabled));

    const rows = await c
      .get("store")
      .db.select()
      .from(customActions)
      .where(and(...filters))
      .orderBy(desc(customActions.updatedAt))
      .limit(100);

    return c.json({ items: rows.map(serializeCustomAction) });
  });

  r.post(prefix, requireAuth(), zValidator("json", customActionBodySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    if (!canAccessBrand(auth, body.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    try {
      const [row] = await c
        .get("store")
        .db.insert(customActions)
        .values({
          orgId: auth.orgId,
          brandId: body.brandId,
          name: body.name,
          description: body.description,
          whenToUse: body.whenToUse,
          parametersSchema: body.parametersSchema,
          endpoint: body.endpoint,
          method: body.method,
          headers: body.headers,
          authType: body.authType,
          authSecretRef: body.authSecretRef,
          dataAccess: body.dataAccess,
          sandbox: body.sandbox,
          enabled: body.enabled,
          createdBy: auth.sub,
        })
        .returning();

      if (!row) return c.json({ error: "create_failed" }, 500);
      return c.json({ action: serializeCustomAction(row) }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return c.json({ error: "action_name_conflict" }, 409);
      }
      throw error;
    }
  });

  r.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [row] = await c
      .get("store")
      .db.select()
      .from(customActions)
      .where(and(eq(customActions.id, c.req.param("id")), eq(customActions.orgId, auth.orgId)))
      .limit(1);

    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.brandId && !canAccessBrand(auth, row.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    return c.json({ action: serializeCustomAction(row) });
  });

  r.patch(
    `${prefix}/:id`,
    requireAuth(),
    zValidator("json", updateCustomActionBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const [existing] = await c
        .get("store")
        .db.select()
        .from(customActions)
        .where(and(eq(customActions.id, c.req.param("id")), eq(customActions.orgId, auth.orgId)))
        .limit(1);

      if (!existing) return c.json({ error: "not_found" }, 404);

      const brandId = body.brandId ?? existing.brandId;
      if (brandId && !canAccessBrand(auth, brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (body.brandId) {
        const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
        if (!brand) return c.json({ error: "brand_not_found" }, 404);
      }

      try {
        const [row] = await c
          .get("store")
          .db.update(customActions)
          .set({
            brandId: body.brandId ?? existing.brandId,
            name: body.name ?? existing.name,
            description: body.description ?? existing.description,
            whenToUse: body.whenToUse ?? existing.whenToUse,
            parametersSchema: body.parametersSchema ?? existing.parametersSchema,
            endpoint: body.endpoint ?? existing.endpoint,
            method: body.method ?? existing.method,
            headers: body.headers ?? existing.headers,
            authType: body.authType ?? existing.authType,
            authSecretRef: body.authSecretRef ?? existing.authSecretRef,
            dataAccess: body.dataAccess ?? existing.dataAccess,
            sandbox: body.sandbox ?? existing.sandbox,
            enabled: body.enabled ?? existing.enabled,
            updatedAt: new Date(),
          })
          .where(eq(customActions.id, existing.id))
          .returning();

        if (!row) return c.json({ error: "update_failed" }, 500);
        return c.json({ action: serializeCustomAction(row) });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return c.json({ error: "action_name_conflict" }, 409);
        }
        throw error;
      }
    },
  );

  r.delete(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [existing] = await c
      .get("store")
      .db.select()
      .from(customActions)
      .where(and(eq(customActions.id, c.req.param("id")), eq(customActions.orgId, auth.orgId)))
      .limit(1);

    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.brandId && !canAccessBrand(auth, existing.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    await c.get("store").db.delete(customActions).where(eq(customActions.id, existing.id));
    return c.body(null, 204);
  });

  r.post(
    `${prefix}/:id/execute`,
    requireAuth(),
    zValidator("json", executeCustomActionBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const [row] = await c
        .get("store")
        .db.select()
        .from(customActions)
        .where(and(eq(customActions.id, c.req.param("id")), eq(customActions.orgId, auth.orgId)))
        .limit(1);

      if (!row) return c.json({ error: "not_found" }, 404);
      if (row.brandId && !canAccessBrand(auth, row.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const result = await executeCustomActionHttpDirect(row, body, {
          fetch: globalThis.fetch.bind(globalThis),
          getSecret: (secretRef) => resolveCustomActionSecretFromEnv(secretRef),
        });
        return c.json({ result });
      } catch (error) {
        const mapped = mapExecutorError(error);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw error;
      }
    },
  );

  return r;
}
