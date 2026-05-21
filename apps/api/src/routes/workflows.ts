import { zValidator } from "@hono/zod-validator";
import { API_VERSION } from "@keenai/shared";
import { createWorkflowBodySchema, updateWorkflowBodySchema } from "@keenai/workflow";
import { workflows } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { assertBrandInOrg } from "../lib/conversations.js";
import { serializeWorkflow } from "../lib/workflow-engine.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function workflowRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/workflows`;

  r.get(prefix, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const rows = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(eq(workflows.orgId, auth.orgId))
      .orderBy(desc(workflows.updatedAt))
      .limit(100);

    return c.json({ items: rows.map(serializeWorkflow) });
  });

  r.post(prefix, requireAuth(), zValidator("json", createWorkflowBodySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    if (body.brandId) {
      const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);
    }

    const [row] = await c
      .get("store")
      .db.insert(workflows)
      .values({
        orgId: auth.orgId,
        brandId: body.brandId,
        name: body.name,
        trigger: body.definition.trigger,
        definition: body.definition,
        status: "draft",
      })
      .returning();

    if (!row) return c.json({ error: "create_failed" }, 500);
    return c.json({ workflow: serializeWorkflow(row) }, 201);
  });

  r.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [row] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .limit(1);

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ workflow: serializeWorkflow(row) });
  });

  r.patch(
    `${prefix}/:id`,
    requireAuth(),
    zValidator("json", updateWorkflowBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const [existing] = await c
        .get("store")
        .db.select()
        .from(workflows)
        .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
        .limit(1);

      if (!existing) return c.json({ error: "not_found" }, 404);

      const [row] = await c
        .get("store")
        .db.update(workflows)
        .set({
          name: body.name ?? existing.name,
          definition: body.definition ?? existing.definition,
          trigger: body.definition?.trigger ?? existing.trigger,
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, existing.id))
        .returning();

      if (!row) return c.json({ error: "update_failed" }, 500);
      return c.json({ workflow: serializeWorkflow(row) });
    },
  );

  r.post(`${prefix}/:id/publish`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [row] = await c
      .get("store")
      .db.update(workflows)
      .set({ status: "published", updatedAt: new Date() })
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .returning();

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ workflow: serializeWorkflow(row) });
  });

  return r;
}
