import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { CHANNEL_TYPES, type ChannelType } from "@keenai/channels-core";
import {
  DASHBOARD_API_PREFIX,
  createConversationSchema,
  createMessageSchema,
  createTicketFromConversationSchema,
  listConversationsSchema,
  listMessagesSchema,
  updateConversationSchema,
} from "@keenai/shared";
import {
  channelConnections,
  channelConversationLinks,
  conversations,
  messages,
} from "@keenai/storage/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { buildAgentOutboundPayload } from "../lib/agent-outbound.js";
import {
  enqueueConversationMessageOperation,
  executeConversationTyping,
} from "../lib/channel-dispatch.js";
import { getChannelPluginRegistry } from "../lib/channel-plugins.js";
import { openChannelCredentials } from "../lib/channel-secrets.js";
import {
  cancelPendingConversationAutoCloseJobs,
  clearConversationAutoCloseMarker,
} from "../lib/conversation-auto-close.js";
import { publishConversation, subscribeConversation } from "../lib/conversation-bus.js";
import {
  assertBrandInOrg,
  buildMessageContent,
  canAccessBrand,
  cursorWhere,
  encodeCursor,
  getConversationForOrg,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
  serializeMessage,
  serializeMessagesWithAttachments,
} from "../lib/conversations.js";
import { indexConversationForSearch } from "../lib/fts-index.js";
import { planConversationImOutbound } from "../lib/im-outbound.js";
import { getKbDispatch } from "../lib/kb-dispatch-init.js";
import { dispatchKbConversationClosed } from "../lib/kb-dispatch.js";
import { notifyAssignee } from "../lib/notifications.js";
import { createTicketFromConversation } from "../lib/tickets.js";
import { listWhatsAppTemplates, whatsappTemplateCredentials } from "../lib/whatsapp-templates.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

const editMessageSchema = z.object({
  plainText: z.string().trim().min(1).max(50_000),
  operationId: z.string().min(1).max(160).optional(),
});

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(128),
  operationId: z.string().min(1).max(160).optional(),
});

export function conversationRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}/conversations`;

  r.get(prefix, requireAuth(), zValidator("query", listConversationsSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const { status, brandId, limit, cursor } = c.req.valid("query");
    const db = c.get("store").db;

    const filters = [eq(conversations.orgId, auth.orgId)];
    if (status) filters.push(eq(conversations.status, status));
    if (brandId) filters.push(eq(conversations.brandId, brandId));
    const cursorFilter = cursorWhere(cursor);
    if (cursorFilter) filters.push(cursorFilter);

    const rows = await db
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows)
      .filter((row) => canAccessBrand(auth, row.brandId))
      .map(serializeConversation);

    const last = items.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeCursor(rows[limit - 1]?.lastMessageAt ?? null, rows[limit - 1]?.id ?? "")
        : null;

    return c.json({ items, nextCursor });
  });

  r.post(prefix, requireAuth(), zValidator("json", createConversationSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    if (!canAccessBrand(auth, body.brandId)) {
      return c.json({ error: "forbidden", message: "brand not in scope" }, 403);
    }

    const db = c.get("store").db;
    const brand = await assertBrandInOrg(db, body.brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const now = new Date();
    const [conversation] = await db
      .insert(conversations)
      .values({
        orgId: auth.orgId,
        brandId: body.brandId,
        userId: body.userId,
        channelType: body.channelType,
        channelId: body.channelId,
        subject: body.subject,
        tags: body.tags ?? [],
        lastMessageAt: body.initialMessage ? now : undefined,
        messageCount: body.initialMessage ? 1 : 0,
        unreadCount: body.initialMessage ? 1 : 0,
      })
      .returning();

    if (!conversation) return c.json({ error: "create_failed" }, 500);

    await recordConversationEvent(db, {
      orgId: auth.orgId,
      conversationId: conversation.id,
      eventType: "conversation.created",
      actorType: "agent",
      actorId: auth.memberId,
    });

    let firstMessage = null;
    if (body.initialMessage) {
      const result = await insertMessage(db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        senderType: "user",
        senderId: body.userId,
        plainText: body.initialMessage.plainText,
        content: buildMessageContent(body.initialMessage.plainText, body.initialMessage.content),
        isInternal: body.initialMessage.isInternal ?? false,
        sentVia: "api",
        isAgentReply: false,
      });
      firstMessage = serializeMessage(result.message);
      if (ctx.fts) {
        await indexConversationForSearch(ctx.fts, db, conversation.id);
      }
    }

    return c.json(
      { conversation: serializeConversation(conversation), message: firstMessage },
      201,
    );
  });

  r.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    if (!conversation) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    return c.json({
      conversation: {
        ...serializeConversation(conversation),
        channelCapabilities: channelCapabilities(conversation.channelType),
        channelOutboundLimits: channelOutboundLimits(conversation.channelType),
      },
    });
  });

  r.get(`${prefix}/:id/channel-templates`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    if (!conversation) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) return c.json({ error: "forbidden" }, 403);
    if (conversation.channelType !== "whatsapp") {
      return c.json({ error: "channel_templates_not_supported" }, 422);
    }

    const [connection] = await c
      .get("store")
      .db.select({ id: channelConnections.id, credentials: channelConnections.credentials })
      .from(channelConversationLinks)
      .innerJoin(
        channelConnections,
        eq(channelConnections.id, channelConversationLinks.connectionId),
      )
      .where(
        and(
          eq(channelConversationLinks.conversationId, conversation.id),
          eq(channelConnections.orgId, auth.orgId),
          eq(channelConnections.channelType, "whatsapp"),
          eq(channelConnections.status, "active"),
        ),
      )
      .limit(1);
    if (!connection) return c.json({ error: "channel_connection_not_found" }, 404);

    try {
      const credentials = whatsappTemplateCredentials(
        openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret),
        c.get("env").WHATSAPP_GRAPH_API_VERSION,
      );
      const items = (await listWhatsAppTemplates(credentials)).filter(
        (template) => template.status === "APPROVED",
      );
      return c.json({ connectionId: connection.id, items });
    } catch (error) {
      c.get("log").warn(
        { err: error, connectionId: connection.id },
        "conversation templates failed",
      );
      return c.json({ error: "channel_templates_provider_failed" }, 502);
    }
  });

  r.patch(
    `${prefix}/:id`,
    requireAuth(),
    zValidator("json", updateConversationSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const body = c.req.valid("json");
      const now = new Date();

      const patch: Record<string, unknown> = { updatedAt: now };

      if (body.status !== undefined) {
        patch.status = body.status;
        patch.closedAt = body.status === "closed" ? now : body.status === "open" ? null : undefined;
        patch.attributes = clearConversationAutoCloseMarker(conversation.attributes ?? {});
      }
      if (body.assigneeId !== undefined) patch.assigneeId = body.assigneeId;
      if (body.teamId !== undefined) patch.teamId = body.teamId;
      if (body.subject !== undefined) patch.subject = body.subject;
      if (body.tags !== undefined) patch.tags = body.tags;
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.rating !== undefined) patch.rating = body.rating;
      if (body.ratingComment !== undefined) patch.ratingComment = body.ratingComment;

      if (body.snoozedUntil !== undefined) {
        const until = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
        patch.snoozedUntil = until;
        if (until && until.getTime() > now.getTime()) {
          patch.status = "snoozed";
        } else if (until === null && conversation.status === "snoozed") {
          patch.status = "open";
        }
      }

      const [updated] = await c
        .get("store")
        .db.update(conversations)
        .set(patch)
        .where(eq(conversations.id, conversation.id))
        .returning();

      if (!updated) return c.json({ error: "update_failed" }, 500);

      if (body.status !== undefined && body.status !== conversation.status) {
        await cancelPendingConversationAutoCloseJobs(c.get("store").db, {
          orgId: auth.orgId,
          conversationId: conversation.id,
          reason: "conversation_state_changed",
          now,
        });
      }

      const serialized = serializeConversation(updated);

      await recordConversationEvent(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        eventType: "conversation.updated",
        actorType: "agent",
        actorId: auth.memberId,
        payload: body,
      });

      publishConversation({
        type: "conversation.updated",
        conversationId: conversation.id,
        conversation: serialized,
      });

      const justClosed = body.status === "closed" && conversation.status !== "closed";
      const ratingSet = body.rating !== undefined;
      if (justClosed || (ratingSet && updated.status === "closed")) {
        try {
          await dispatchKbConversationClosed(getKbDispatch(), c.get("store").db, {
            orgId: auth.orgId,
            brandId: conversation.brandId,
            conversationId: conversation.id,
          });
        } catch {
          // KB crystallize is best-effort on close / CSAT
        }
      }

      if (updated.status !== conversation.status) {
        const { getWorkflowDispatch } = await import("../lib/workflow-dispatch.js");
        await getWorkflowDispatch().dispatchConversationTrigger({
          orgId: auth.orgId,
          brandId: updated.brandId,
          conversationId: updated.id,
          trigger: "conversation_state_changed",
          facts: {
            channelType: updated.channelType,
            priority: updated.priority ?? "normal",
            conversationStatus: updated.status,
          },
        });
      }

      if (
        body.assigneeId !== undefined &&
        body.assigneeId &&
        body.assigneeId !== conversation.assigneeId
      ) {
        const { getWorkflowDispatch } = await import("../lib/workflow-dispatch.js");
        await getWorkflowDispatch().dispatchConversationTrigger({
          orgId: auth.orgId,
          brandId: updated.brandId,
          conversationId: updated.id,
          trigger: "assigned_to_member",
          facts: {
            channelType: updated.channelType,
            priority: updated.priority ?? "normal",
            conversationStatus: updated.status,
          },
        });
      }

      if (body.teamId !== undefined && body.teamId && body.teamId !== conversation.teamId) {
        const { getWorkflowDispatch } = await import("../lib/workflow-dispatch.js");
        await getWorkflowDispatch().dispatchConversationTrigger({
          orgId: auth.orgId,
          brandId: updated.brandId,
          conversationId: updated.id,
          trigger: "assigned_to_team",
          facts: {
            channelType: updated.channelType,
            priority: updated.priority ?? "normal",
            conversationStatus: updated.status,
          },
        });
      }

      if (
        body.assigneeId !== undefined &&
        body.assigneeId &&
        body.assigneeId !== conversation.assigneeId
      ) {
        await notifyAssignee(c.get("store").db, {
          orgId: auth.orgId,
          assigneeMemberId: body.assigneeId,
          conversationId: conversation.id,
          subject: updated.subject,
          actorMemberId: auth.memberId,
        });
      }

      if (ctx.fts) {
        await indexConversationForSearch(ctx.fts, c.get("store").db, conversation.id);
      }

      return c.json({ conversation: serialized });
    },
  );

  r.get(
    `${prefix}/:id/messages`,
    requireAuth(),
    zValidator("query", listMessagesSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const { limit, before } = c.req.valid("query");
      const db = c.get("store").db;
      const filters = [
        eq(messages.conversationId, conversation.id),
        eq(messages.orgId, auth.orgId),
      ];

      if (before) {
        const [anchor] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(and(eq(messages.id, before), eq(messages.conversationId, conversation.id)))
          .limit(1);
        if (anchor) filters.push(lt(messages.createdAt, anchor.createdAt));
      }

      const rows = await db
        .select()
        .from(messages)
        .where(and(...filters))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      const items = await serializeMessagesWithAttachments(db, rows.reverse());
      return c.json({ items });
    },
  );

  r.post(
    `${prefix}/:id/messages`,
    requireAuth(),
    zValidator("json", createMessageSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const body = c.req.valid("json");
      const senderType = body.senderType ?? "agent";
      const isAgentReply = senderType === "agent" || senderType === "ai";
      if (body.directives && (body.isInternal || !isAgentReply)) {
        return c.json({ error: "outbound_directives_require_external_agent_message" }, 422);
      }
      if (body.directives?.whatsappTemplate && conversation.channelType !== "whatsapp") {
        return c.json({ error: "whatsapp_template_channel_required" }, 422);
      }

      let plainText = body.plainText;
      let attachmentIds = body.attachmentIds;

      if (!plainText?.trim() && body.directives?.whatsappTemplate) {
        plainText = `[WhatsApp template: ${body.directives.whatsappTemplate.name}]`;
      }

      if (body.agentOutboundText?.trim()) {
        try {
          const outbound = await buildAgentOutboundPayload(
            c.get("store").db,
            ctx.env,
            auth.orgId,
            body.agentOutboundText,
          );
          plainText = outbound.plainText;
          attachmentIds = [...new Set([...(attachmentIds ?? []), ...outbound.attachmentIds])];
        } catch (e) {
          if (e instanceof Error && e.message === "invalid_attachments") {
            return c.json({ error: "invalid_attachments" }, 400);
          }
          throw e;
        }
      }

      const content = plainText ? buildMessageContent(plainText, body.content) : undefined;
      if (content && body.directives) content.outboundDirectives = body.directives;

      const result = await insertMessage(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        senderType,
        senderId: auth.memberId,
        plainText,
        content,
        attachmentIds,
        parts: body.parts,
        isInternal: body.isInternal,
        inReplyTo: body.inReplyTo,
        sentVia: body.agentOutboundText?.trim() ? "agent" : "web",
        isAgentReply,
      });

      await recordConversationEvent(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        eventType: "message.created",
        actorType: "agent",
        actorId: auth.memberId,
        payload: { messageId: result.message.id },
      });

      if (senderType === "user" && !body.isInternal) {
        const { resumeCollectCustomerReplyForMessage } = await import("../lib/workflow-resume.js");
        await resumeCollectCustomerReplyForMessage(
          c.get("store").db,
          {
            orgId: auth.orgId,
            conversationId: conversation.id,
            messageId: result.message.id,
            plainText: result.message.plainText,
          },
          ctx.env,
          ctx.authConfig,
        );
      }

      if (ctx.fts) {
        await indexConversationForSearch(ctx.fts, c.get("store").db, conversation.id);
      }

      return c.json({ message: result.serialized }, 201);
    },
  );

  r.patch(
    `${prefix}/:id/messages/:messageId`,
    requireAuth(),
    zValidator("json", editMessageSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) return c.json({ error: "forbidden" }, 403);
      const body = c.req.valid("json");
      const result = await enqueueConversationMessageOperation({
        orgId: auth.orgId,
        conversationId: conversation.id,
        messageId: c.req.param("messageId"),
        operationId: operationId(c.req.header("Idempotency-Key"), body.operationId),
        type: "edit",
        actorId: auth.memberId,
        plainText: body.plainText,
      });
      const response = operationResponse(result);
      return c.json(response.body, response.status);
    },
  );

  r.delete(`${prefix}/:id/messages/:messageId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    if (!conversation) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) return c.json({ error: "forbidden" }, 403);
    const result = await enqueueConversationMessageOperation({
      orgId: auth.orgId,
      conversationId: conversation.id,
      messageId: c.req.param("messageId"),
      operationId: operationId(c.req.header("Idempotency-Key")),
      type: "delete",
      actorId: auth.memberId,
    });
    const response = operationResponse(result);
    return c.json(response.body, response.status);
  });

  for (const [method, type] of [
    ["put", "reaction.add"],
    ["delete", "reaction.remove"],
  ] as const) {
    r[method](
      `${prefix}/:id/messages/:messageId/reactions`,
      requireAuth(),
      zValidator("json", reactionSchema),
      async (c) => {
        const auth = c.get("auth");
        if (!auth) return c.json({ error: "unauthorized" }, 401);
        const conversation = await getConversationForOrg(
          c.get("store").db,
          c.req.param("id"),
          auth.orgId,
        );
        if (!conversation) return c.json({ error: "not_found" }, 404);
        if (!canAccessBrand(auth, conversation.brandId)) {
          return c.json({ error: "forbidden" }, 403);
        }
        const body = c.req.valid("json");
        const result = await enqueueConversationMessageOperation({
          orgId: auth.orgId,
          conversationId: conversation.id,
          messageId: c.req.param("messageId"),
          operationId: operationId(c.req.header("Idempotency-Key"), body.operationId),
          type,
          actorId: auth.memberId,
          emoji: body.emoji,
        });
        const response = operationResponse(result);
        return c.json(response.body, response.status);
      },
    );
  }

  r.post(`${prefix}/:id/typing`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    if (!conversation) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) return c.json({ error: "forbidden" }, 403);
    const result = await executeConversationTyping({
      orgId: auth.orgId,
      conversationId: conversation.id,
    });
    if (!result.executed) {
      return c.json(
        { error: result.reason },
        result.reason === "operation_not_supported" ? 422 : 409,
      );
    }
    return c.json({ executed: true });
  });

  r.get(`${prefix}/:id/messages/:messageId/im-outbound`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    if (!conversation) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const apiBaseUrl = new URL(c.req.url).origin;
    try {
      const plan = await planConversationImOutbound(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        messageId: c.req.param("messageId"),
        apiBaseUrl,
      });
      if (!plan) return c.json({ error: "not_im_channel" }, 400);
      return c.json(plan);
    } catch (e) {
      if (e instanceof Error && e.message === "message not found") {
        return c.json({ error: "not_found" }, 404);
      }
      throw e;
    }
  });

  r.post(
    `${prefix}/:id/ticket`,
    requireAuth(),
    zValidator("json", createTicketFromConversationSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      if (!conversation) return c.json({ error: "not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const body = c.req.valid("json");
      const ticket = await createTicketFromConversation(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        reporterId: auth.memberId,
        title: body.title,
      });
      return c.json({ ticket }, 201);
    },
  );

  r.get(`${prefix}/:id/stream`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    if (!conversation) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const conversationId = conversation.id;

    return streamSSE(c, async (stream) => {
      const unsubscribe = subscribeConversation(conversationId, async (event) => {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      });

      stream.onAbort(() => {
        unsubscribe();
      });

      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ conversationId }),
      });

      while (!stream.closed) {
        await stream.sleep(25_000);
        await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });

  return r;
}

function operationId(headerValue?: string, bodyValue?: string): string {
  const value = headerValue?.trim() || bodyValue?.trim();
  return value && value.length <= 160 ? value : randomUUID();
}

function channelCapabilities(channelType: string): string[] {
  if (!CHANNEL_TYPES.includes(channelType as ChannelType)) return [];
  return [...getChannelPluginRegistry().get(channelType as ChannelType).capabilities];
}

function channelOutboundLimits(channelType: string) {
  if (!CHANNEL_TYPES.includes(channelType as ChannelType)) return null;
  return getChannelPluginRegistry().get(channelType as ChannelType).outboundLimits;
}

function operationResponse(
  result: Awaited<ReturnType<typeof enqueueConversationMessageOperation>>,
) {
  if (result.enqueued) return { body: result, status: 202 as const };
  if (result.reason === "message_not_found" || result.reason === "provider_message_not_found") {
    return { body: { error: result.reason }, status: 404 as const };
  }
  if (result.reason === "message_not_owned") {
    return { body: { error: result.reason }, status: 403 as const };
  }
  if (result.reason === "already_applied") {
    return { body: { applied: true, duplicate: true }, status: 200 as const };
  }
  if (
    result.reason === "operation_not_supported" ||
    result.reason === "provider_message_operation_target_not_found" ||
    result.reason === "plain_text_required" ||
    result.reason === "emoji_required"
  ) {
    return { body: { error: result.reason }, status: 422 as const };
  }
  return { body: { error: result.reason }, status: 409 as const };
}
