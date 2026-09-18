import { zValidator } from "@hono/zod-validator";
import { buildStructuredAgentPlan } from "@keenai/agent";
import { parseAgentResponse } from "@keenai/channels-core";
import type { AgentResponseParseResult } from "@keenai/shared";
import {
  DASHBOARD_API_PREFIX,
  copilotDraftBodySchema,
  copilotEventBodySchema,
} from "@keenai/shared";
import { attachments, copilotEvents } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createAgentRun,
  loadAgentToolPolicyRules,
  persistAgentContext,
  persistAgentPlan,
  transitionAgentRun,
} from "../lib/agent-audit-store.js";
import { executeAuditedAgentDraft } from "../lib/agent-runtime.js";
import { createAppLlmRegistry } from "../lib/app-llm-registry.js";
import { canAccessBrand, getConversationForOrg } from "../lib/conversations.js";
import { buildCopilotDraftRequest } from "../lib/copilot-context.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function copilotRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}/copilot`;
  const llm = createAppLlmRegistry(ctx.env);

  r.post(
    `${prefix}/draft`,
    requireAuth(),
    zValidator("json", copilotDraftBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const conversation = await getConversationForOrg(
        c.get("store").db,
        body.conversationId,
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const provider =
        body.providerId != null
          ? (llm.getProvider(body.providerId) ?? llm.resolveDraftProvider())
          : llm.resolveDraftProvider();
      const db = c.get("store").db;
      const run = await createAgentRun(db, {
        orgId: auth.orgId,
        brandId: conversation.brandId,
        conversationId: conversation.id,
        trigger: "copilot_draft",
        actorType: "member",
        actorId: auth.memberId,
        providerId: provider.id,
        inputSnapshot: {
          source: "copilot",
          conversationId: conversation.id,
          subject: conversation.subject,
          instruction: body.instruction,
          providerId: provider.id,
        },
      });
      await transitionAgentRun(db, {
        runId: run.id,
        orgId: auth.orgId,
        status: "planning",
        phase: "plan",
        eventType: "plan.started",
      });

      const {
        request: draftRequest,
        memoryScope,
        toolNames,
        auditContext,
      } = await buildCopilotDraftRequest(db, ctx.env, {
        conversationId: conversation.id,
        orgId: auth.orgId,
        brandId: conversation.brandId,
        userId: conversation.userId,
        subject: conversation.subject ?? undefined,
        instruction: body.instruction,
      });
      const plan = buildStructuredAgentPlan({
        intent: auditContext.intent,
        instruction: body.instruction,
        subject: conversation.subject ?? undefined,
        tools: draftRequest.tools,
      });
      await persistAgentPlan(db, { runId: run.id, orgId: auth.orgId, plan });
      const context = await persistAgentContext(db, {
        runId: run.id,
        orgId: auth.orgId,
        memoryScope,
        intent: auditContext.intent,
        weights: auditContext.weights,
        sections: auditContext.sections,
        text: auditContext.text,
      });
      const policyRules = await loadAgentToolPolicyRules(db, {
        orgId: auth.orgId,
        brandId: conversation.brandId,
      });

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          event: "meta",
          data: JSON.stringify({ providerId: provider.id, memoryScope, toolNames, runId: run.id }),
        });

        const result = await executeAuditedAgentDraft({
          db,
          identity: {
            runId: run.id,
            orgId: auth.orgId,
            conversationId: conversation.id,
            actorId: auth.memberId,
            actorRole: auth.role,
            channel: conversation.channelType,
            toolBudget: run.toolBudget,
          },
          provider,
          request: draftRequest,
          plan,
          evidenceCount: context.evidenceCount,
          policyRules,
        });
        if (result.status === "awaiting_approval") {
          await stream.writeSSE({
            event: "approval.required",
            data: JSON.stringify({
              runId: run.id,
              approvalId: result.approvalId,
              status: result.status,
            }),
          });
          await stream.writeSSE({ event: "done", data: JSON.stringify({ runId: run.id }) });
          return;
        }

        const parsed = parseAgentResponse(result.replyText);
        for (let i = 0; i < parsed.plainText.length; i += 12) {
          await stream.writeSSE({
            data: JSON.stringify({ text: parsed.plainText.slice(i, i + 12) }),
          });
        }

        const readyAttachments = await resolveReadyAttachments(
          c.get("store").db,
          auth.orgId,
          parsed,
        );
        for (const item of readyAttachments) {
          await stream.writeSSE({
            event: "attachment.ready",
            data: JSON.stringify(item),
          });
        }

        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ runId: run.id, status: result.status }),
        });
      });
    },
  );

  r.post(
    `${prefix}/events`,
    requireAuth(),
    zValidator("json", copilotEventBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const conversation = await getConversationForOrg(
        c.get("store").db,
        body.conversationId,
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);

      const [row] = await c
        .get("store")
        .db.insert(copilotEvents)
        .values({
          orgId: auth.orgId,
          memberId: auth.memberId,
          conversationId: body.conversationId,
          action: body.action,
          draftLength: body.draftLength,
          providerId: body.providerId,
        })
        .returning();

      return c.json({ event: { id: row?.id, action: body.action } }, 201);
    },
  );

  r.get(`${prefix}/providers`, requireAuth(), (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    return c.json({
      defaultProviderId: llm.resolveDraftProvider().id,
      items: llm.listProviderSummaries(),
    });
  });

  return r;
}

async function resolveReadyAttachments(
  db: AppVariables["store"]["db"],
  orgId: string,
  parsed: AgentResponseParseResult,
): Promise<{ attachmentId: string; mime: string }[]> {
  const rows = [];

  if (parsed.attachmentIds.length > 0) {
    rows.push(
      ...(await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.orgId, orgId), inArray(attachments.id, parsed.attachmentIds)))),
    );
  }

  if (parsed.storageKeys.length > 0) {
    rows.push(
      ...(await db
        .select()
        .from(attachments)
        .where(
          and(eq(attachments.orgId, orgId), inArray(attachments.storageKey, parsed.storageKeys)),
        )),
    );
  }

  const byId = new Map(
    rows.map((row) => [
      row.id,
      {
        attachmentId: row.id,
        mime: row.contentType ?? "application/octet-stream",
      },
    ]),
  );

  return [...byId.values()];
}
