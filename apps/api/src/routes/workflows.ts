import { zValidator } from "@hono/zod-validator";
import { API_VERSION } from "@keenai/shared";
import {
  auditLogs,
  conversations,
  workflowRuns,
  workflowVersions,
  workflows,
} from "@keenai/storage/schema";
import {
  type WorkflowActionHandlers,
  createWorkflowBodySchema,
  listWorkflowTemplates,
  runWorkflow,
  updateWorkflowBodySchema,
  workflowDefinitionSchema,
} from "@keenai/workflow";
import { type SQL, and, desc, eq, inArray, ne } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { assertBrandInOrg } from "../lib/conversations.js";
import {
  serializeWorkflow,
  serializeWorkflowRun,
  serializeWorkflowVersion,
} from "../lib/workflow-engine.js";
import { executeWorkflow } from "../lib/workflow-engine.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

const workflowShadowBodySchema = z
  .object({
    limit: z.number().int().min(1).max(25).default(5),
    conversationIds: z.array(z.string().min(1)).min(1).max(25).optional(),
  })
  .default({});

const workflowWebhookTriggerBodySchema = z.object({
  brandId: z.string().min(1).optional(),
  conversationId: z.string().min(1),
  eventName: z.string().min(1).max(128).default("webhook/inbound.received"),
  payload: z.record(z.unknown()).default({}),
});

type WorkflowRouteContext = Context<{ Variables: AppVariables }>;
type WorkflowAuditAuth = { orgId: string; sub: string };

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

  r.get(`${prefix}/templates`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    return c.json({ items: listWorkflowTemplates() });
  });

  r.post(
    `${prefix}/webhooks/trigger`,
    requireAuth(),
    zValidator("json", workflowWebhookTriggerBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const [conversation] = await c
        .get("store")
        .db.select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, body.conversationId),
            eq(conversations.orgId, auth.orgId),
            ...(body.brandId ? [eq(conversations.brandId, body.brandId)] : []),
          ),
        )
        .limit(1);
      if (!conversation) return c.json({ error: "conversation_not_found" }, 404);

      const rows = await c
        .get("store")
        .db.select()
        .from(workflows)
        .where(
          and(
            eq(workflows.orgId, auth.orgId),
            eq(workflows.status, "published"),
            eq(workflows.trigger, "webhook"),
          ),
        )
        .orderBy(desc(workflows.updatedAt));

      const runs = [];
      for (const workflow of rows) {
        if (workflow.brandId && workflow.brandId !== conversation.brandId) continue;
        const run = await executeWorkflow(
          c.get("store").db,
          workflow,
          conversation.id,
          c.get("env"),
          c.get("authConfig"),
        );
        if (run) runs.push(serializeWorkflowRun(run));
      }

      return c.json({
        mode: "webhook",
        eventName: body.eventName,
        triggered: runs.length,
        runs,
      });
    },
  );

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

    await writeWorkflowAudit(c, auth, {
      action: "workflow.publish",
      workflowId: existing.id,
      changes: {
        before: { status: existing.status, publishedDefinition: existing.publishedDefinition },
        after: { status: row.status, publishedDefinition: row.publishedDefinition },
        version: version ? serializeWorkflowVersion(version) : null,
      },
    });

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
    await writeWorkflowAudit(c, auth, {
      action: "workflow.unpublish",
      workflowId: existing.id,
      changes: {
        before: { status: existing.status },
        after: { status: row.status },
      },
    });
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

    await writeWorkflowAudit(c, auth, {
      action: "workflow.delete",
      workflowId: existing.id,
      changes: {
        before: { status: existing.status },
        after: { status: "archived" },
      },
    });

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
    await writeWorkflowAudit(c, auth, {
      action: "workflow.rollback",
      workflowId: existing.id,
      changes: {
        before: {
          status: existing.status,
          definition: existing.definition,
          publishedDefinition: existing.publishedDefinition,
        },
        after: {
          status: row.status,
          definition: row.definition,
          publishedDefinition: row.publishedDefinition,
        },
        version: serializeWorkflowVersion(snapshot),
      },
    });
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

  r.post(`${prefix}/:id/shadow`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const parsedBody = workflowShadowBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return c.json({ error: "invalid_body", issues: parsedBody.error.issues }, 400);
    }

    const [workflow] = await c
      .get("store")
      .db.select()
      .from(workflows)
      .where(and(eq(workflows.id, c.req.param("id")), eq(workflows.orgId, auth.orgId)))
      .limit(1);
    if (!workflow) return c.json({ error: "not_found" }, 404);

    const filters: SQL[] = [
      eq(conversations.orgId, auth.orgId),
      eq(conversations.status, "closed"),
    ];
    if (workflow.brandId) filters.push(eq(conversations.brandId, workflow.brandId));
    if (parsedBody.data.conversationIds) {
      filters.push(inArray(conversations.id, parsedBody.data.conversationIds));
    }

    const samples = await c
      .get("store")
      .db.select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.closedAt), desc(conversations.updatedAt))
      .limit(parsedBody.data.limit);

    const definition = workflowDefinitionSchema.parse(workflow.definition);
    const items = [];
    for (const conversation of samples) {
      const result = await runWorkflow(definition, createDryRunWorkflowHandlers(), {
        workflowId: workflow.id,
        workflowRunId: `shadow-${conversation.id}`,
        orgId: workflow.orgId,
        brandId: conversation.brandId,
        conversationId: conversation.id,
        targetCustomerId: conversation.userId,
        subject: conversation.subject ?? undefined,
        isShadowRun: true,
        facts: {
          channelType: conversation.channelType,
          priority: conversation.priority ?? undefined,
          conversationStatus: conversation.status,
        },
      });
      items.push({
        conversationId: conversation.id,
        result,
      });
    }

    return c.json({ mode: "shadow", sampled: items.length, items });
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

async function writeWorkflowAudit(
  c: WorkflowRouteContext,
  auth: WorkflowAuditAuth,
  input: { action: string; workflowId: string; changes?: Record<string, unknown> },
) {
  await c
    .get("store")
    .db.insert(auditLogs)
    .values({
      orgId: auth.orgId,
      actorType: "account",
      actorId: auth.sub,
      action: input.action,
      resourceType: "workflow",
      resourceId: input.workflowId,
      changes: input.changes,
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: c.req.header("user-agent"),
    });
}
