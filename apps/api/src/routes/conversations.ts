import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createConversationSchema,
  createMessageSchema,
  createTicketFromConversationSchema,
  listConversationsSchema,
  listMessagesSchema,
  updateConversationSchema,
} from "@keenai/shared";
import { conversations, messages } from "@keenai/storage/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
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
} from "../lib/conversations.js";
import { indexConversationForSearch } from "../lib/fts-index.js";
import { notifyAssignee } from "../lib/notifications.js";
import { createTicketFromConversation } from "../lib/tickets.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function conversationRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/conversations`;

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

    return c.json({ conversation: serializeConversation(conversation) });
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
      }
      if (body.assigneeId !== undefined) patch.assigneeId = body.assigneeId;
      if (body.subject !== undefined) patch.subject = body.subject;
      if (body.tags !== undefined) patch.tags = body.tags;
      if (body.priority !== undefined) patch.priority = body.priority;

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

      return c.json({
        items: rows.reverse().map(serializeMessage),
      });
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

      const result = await insertMessage(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        senderType,
        senderId: auth.memberId,
        plainText: body.plainText,
        content: buildMessageContent(body.plainText, body.content),
        isInternal: body.isInternal,
        inReplyTo: body.inReplyTo,
        sentVia: "web",
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

      if (ctx.fts) {
        await indexConversationForSearch(ctx.fts, c.get("store").db, conversation.id);
      }

      return c.json({ message: serializeMessage(result.message) }, 201);
    },
  );

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
