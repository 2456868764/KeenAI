import { zValidator } from "@hono/zod-validator";
import { parseAgentResponse } from "@keenai/channels-core";
import { createLlmRegistry } from "@keenai/llm";
import type { AgentResponseParseResult } from "@keenai/shared";
import { API_VERSION, copilotDraftBodySchema, copilotEventBodySchema } from "@keenai/shared";
import { attachments, copilotEvents } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { canAccessBrand, getConversationForOrg } from "../lib/conversations.js";
import { buildCopilotDraftRequest } from "../lib/copilot-context.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function copilotRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/copilot`;
  const llm = createLlmRegistry({
    provider: ctx.env.LLM_PROVIDER,
    openaiApiKey: ctx.env.OPENAI_API_KEY,
    openaiModel: ctx.env.OPENAI_MODEL,
    anthropicApiKey: ctx.env.ANTHROPIC_API_KEY,
    anthropicModel: ctx.env.ANTHROPIC_MODEL,
    deepseekApiKey: ctx.env.DEEPSEEK_API_KEY,
    deepseekModel: ctx.env.DEEPSEEK_MODEL,
    kimiApiKey: ctx.env.KIMI_API_KEY,
    kimiModel: ctx.env.KIMI_MODEL,
    qwenApiKey: ctx.env.QWEN_API_KEY,
    qwenModel: ctx.env.QWEN_MODEL,
    zhipuApiKey: ctx.env.ZHIPU_API_KEY,
    zhipuModel: ctx.env.ZHIPU_MODEL,
    geminiApiKey: ctx.env.GEMINI_API_KEY,
    geminiModel: ctx.env.GEMINI_MODEL,
    ollamaBaseUrl: ctx.env.OLLAMA_BASE_URL,
    ollamaModel: ctx.env.OLLAMA_MODEL,
  });

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

      const {
        request: draftRequest,
        memoryScope,
        toolNames,
      } = await buildCopilotDraftRequest(c.get("store").db, ctx.env, {
        conversationId: conversation.id,
        orgId: auth.orgId,
        brandId: conversation.brandId,
        userId: conversation.userId,
        subject: conversation.subject ?? undefined,
        instruction: body.instruction,
      });

      const provider =
        body.providerId != null
          ? (llm.getProvider(body.providerId) ?? llm.resolveDraftProvider())
          : llm.resolveDraftProvider();

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          event: "meta",
          data: JSON.stringify({ providerId: provider.id, memoryScope, toolNames }),
        });

        let rawText = "";
        for await (const chunk of provider.streamDraft(draftRequest)) {
          if (chunk.type === "text-delta") {
            rawText += chunk.text;
          }
        }

        const parsed = parseAgentResponse(rawText);
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

        await stream.writeSSE({ event: "done", data: "{}" });
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
