import { zValidator } from "@hono/zod-validator";
import { API_VERSION } from "@keenai/shared";
import { workflowRuns, workflowVersions, workflows } from "@keenai/storage/schema";
import {
  type WorkflowActionHandlers,
  createWorkflowBodySchema,
  runWorkflow,
  updateWorkflowBodySchema,
  workflowDefinitionSchema,
} from "@keenai/workflow";
import { and, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { assertBrandInOrg } from "../lib/conversations.js";
import {
  serializeWorkflow,
  serializeWorkflowRun,
  serializeWorkflowVersion,
} from "../lib/workflow-engine.js";
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
      .where(and(eq(workflows.orgId, auth.orgId), ne(workflows.status, "archived")))
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

  r.get(`${prefix}/runs/:runId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [row] = await c
      .get("store")
      .db.select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, c.req.param("runId")), eq(workflowRuns.orgId, auth.orgId)))
      .limit(1);

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ run: serializeWorkflowRun(row) });
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

  r.get(`${prefix}/:id/runs`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const workflowId = c.req.param("id");
    const [workflow] = await c
      .get("store")
      .db.select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.orgId, auth.orgId)))
      .limit(1);

    if (!workflow) return c.json({ error: "not_found" }, 404);

    const rows = await c
      .get("store")
      .db.select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.orgId, auth.orgId)))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(50);

    return c.json({ items: rows.map(serializeWorkflowRun) });
  });

  r.get(`${prefix}/:id/runs/:runId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [row] = await c
      .get("store")
      .db.select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.id, c.req.param("runId")),
          eq(workflowRuns.workflowId, c.req.param("id")),
          eq(workflowRuns.orgId, auth.orgId),
        ),
      )
      .limit(1);

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ run: serializeWorkflowRun(row) });
  });

  r.post(`${prefix}/:id/publish`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [existing] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .limit(1);

    if (!existing) return c.json({ error: "not_found" }, 404);

    const [latestVersion] = await c
      .get("store")
      .db.select({ version: workflowVersions.version })
      .from(workflowVersions)
      .where(
        and(eq(workflowVersions.workflowId, existing.id), eq(workflowVersions.orgId, auth.orgId)),
      )
      .orderBy(desc(workflowVersions.version))
      .limit(1);
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const [row] = await c
      .get("store")
      .db.update(workflows)
      .set({
        status: "published",
        publishedDefinition: existing.definition,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, existing.id))
      .returning();

    if (!row) return c.json({ error: "not_found" }, 404);

    const [version] = await c
      .get("store")
      .db.insert(workflowVersions)
      .values({
        orgId: auth.orgId,
        workflowId: existing.id,
        version: nextVersion,
        snapshot: existing.definition,
      })
      .returning();

    return c.json({
      workflow: serializeWorkflow(row),
      version: version ? serializeWorkflowVersion(version) : null,
    });
  });

  r.post(`${prefix}/:id/unpublish`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

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
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(workflows.id, existing.id))
      .returning();

    if (!row) return c.json({ error: "update_failed" }, 500);
    return c.json({ workflow: serializeWorkflow(row) });
  });

  r.post(`${prefix}/:id/duplicate`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [existing] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);

    const [row] = await c
      .get("store")
      .db.insert(workflows)
      .values({
        orgId: existing.orgId,
        brandId: existing.brandId,
        name: `${existing.name} copy`,
        trigger: existing.trigger,
        definition: existing.definition,
        status: "draft",
      })
      .returning();

    if (!row) return c.json({ error: "create_failed" }, 500);
    return c.json({ workflow: serializeWorkflow(row) }, 201);
  });

  r.delete(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [existing] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);

    await c
      .get("store")
      .db.update(workflows)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(workflows.id, existing.id));

    return c.body(null, 204);
  });

  r.get(`${prefix}/:id/versions`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const workflowId = c.req.param("id");
    const [workflow] = await c
      .get("store")
      .db.select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.orgId, auth.orgId)))
      .limit(1);
    if (!workflow) return c.json({ error: "not_found" }, 404);

    const rows = await c
      .get("store")
      .db.select()
      .from(workflowVersions)
      .where(
        and(eq(workflowVersions.workflowId, workflowId), eq(workflowVersions.orgId, auth.orgId)),
      )
      .orderBy(desc(workflowVersions.version))
      .limit(100);

    return c.json({ items: rows.map(serializeWorkflowVersion) });
  });

  r.post(`${prefix}/:id/rollback/:version`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) return c.json({ error: "invalid_version" }, 400);

    const workflowId = c.req.param("id");
    const [existing] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.orgId, auth.orgId)))
      .limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);

    const [snapshot] = await c
      .get("store")
      .db.select()
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.workflowId, workflowId),
          eq(workflowVersions.orgId, auth.orgId),
          eq(workflowVersions.version, version),
        ),
      )
      .limit(1);
    if (!snapshot) return c.json({ error: "version_not_found" }, 404);

    const [row] = await c
      .get("store")
      .db.update(workflows)
      .set({
        definition: snapshot.snapshot,
        ...(existing.status === "published" ? { publishedDefinition: snapshot.snapshot } : {}),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, existing.id))
      .returning();

    if (!row) return c.json({ error: "rollback_failed" }, 500);
    return c.json({
      workflow: serializeWorkflow(row),
      version: serializeWorkflowVersion(snapshot),
    });
  });

  r.post(`${prefix}/:id/test`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const [workflow] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .limit(1);
    if (!workflow) return c.json({ error: "not_found" }, 404);

    const definition = workflowDefinitionSchema.parse(workflow.definition);
    const result = await runWorkflow(definition, createDryRunWorkflowHandlers(), {
      workflowId: workflow.id,
      workflowRunId: "dry-run",
      orgId: workflow.orgId,
      brandId: workflow.brandId ?? "dry-run-brand",
      conversationId: "dry-run-conversation",
      isShadowRun: true,
    });

    return c.json({ mode: "dry-run", result });
  });

  r.post(`${prefix}/jobs/scan-unresponsive`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const { getWorkflowDispatch } = await import("../lib/workflow-dispatch.js");
    const result = await getWorkflowDispatch().scanCustomerUnresponsive(auth.orgId);
    return c.json({ mode: getWorkflowDispatch().mode, ...result });
  });

  return r;
}

function createDryRunWorkflowHandlers(): WorkflowActionHandlers {
  return {
    sendMessage: async () => {},
    assign: async () => {},
    close: async () => {},
    letKeeniAnswer: async () => ({
      replyText: "Dry-run Keeni response",
      resolution: { type: "unresolved", confidence: 0, evidence: "dry-run" },
      nextBlockId: null,
    }),
    wait: async () => {},
    httpRequest: async () => ({ status: 200, body: "" }),
    convertToTicket: async () => ({ ticketId: "dry-run-ticket" }),
    linkTicket: async (input) => ({
      parentTicketId: input.parentTicketId ?? "dry-run-parent-ticket",
      childTicketId: input.childTicketId,
    }),
    sendTicketUpdate: async () => ({ sent: true }),
    collectData: async () => {},
    replyButtons: async () => {},
    snooze: async () => {},
    csat: async () => {},
    tagConversation: async () => {},
  };
}
