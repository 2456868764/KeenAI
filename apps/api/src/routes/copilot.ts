import { zValidator } from "@hono/zod-validator";
import { createLlmRegistry } from "@keenai/llm";
import { API_VERSION, copilotDraftBodySchema, copilotEventBodySchema } from "@keenai/shared";
import { copilotEvents, messages } from "@keenai/storage/schema";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { canAccessBrand, getConversationForOrg } from "../lib/conversations.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function copilotRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/copilot`;
  const llm = createLlmRegistry({
    provider: ctx.env.LLM_PROVIDER,
    openaiApiKey: ctx.env.OPENAI_API_KEY,
    openaiModel: ctx.env.OPENAI_MODEL,
    deepseekApiKey: ctx.env.DEEPSEEK_API_KEY,
    deepseekModel: ctx.env.DEEPSEEK_MODEL,
    kimiApiKey: ctx.env.KIMI_API_KEY,
    kimiModel: ctx.env.KIMI_MODEL,
    geminiApiKey: ctx.env.GEMINI_API_KEY,
    geminiModel: ctx.env.GEMINI_MODEL,
  });

  r.post(`${prefix}/draft`, requireAuth(), zValidator("json", copilotDraftBodySchema), async (c) => {
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

    const rows = await c
      .get("store")
      .db.select({
        senderType: messages.senderType,
        plainText: messages.plainText,
        isInternal: messages.isInternal,
      })
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversation.id), eq(messages.orgId, auth.orgId)),
      )
      .orderBy(asc(messages.createdAt))
      .limit(50);

    const draftMessages = rows
      .filter((m) => !m.isInternal)
      .map((m) => ({
        role: (m.senderType === "user" ? "user" : "agent") as "user" | "agent",
        plainText: m.plainText,
      }));

    if (draftMessages.length === 0) {
      draftMessages.push({ role: "user", plainText: conversation.subject ?? "Hello" });
    }

    const provider =
      body.providerId != null
        ? (llm.getProvider(body.providerId) ?? llm.resolveDraftProvider())
        : llm.resolveDraftProvider();

    return streamSSE(c, async (stream) => {
      stream.writeSSE({
        event: "meta",
        data: JSON.stringify({ providerId: provider.id }),
      });

      for await (const chunk of provider.streamDraft({
        messages: draftMessages,
        instruction: body.instruction,
        subject: conversation.subject ?? undefined,
      })) {
        if (chunk.type === "text-delta") {
          stream.writeSSE({ data: JSON.stringify({ text: chunk.text }) });
        }
      }

      stream.writeSSE({ event: "done", data: "{}" });
    });
  });

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
