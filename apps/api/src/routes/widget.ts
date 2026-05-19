import { zValidator } from "@hono/zod-validator";
import { randomToken, signWidgetAccessToken, verifyWidgetUserHash } from "@keenai/auth";
import {
  API_VERSION,
  widgetCreateConversationSchema,
  widgetPostMessageSchema,
  widgetSessionSchema,
} from "@keenai/shared";
import { Hono } from "hono";
import { publishConversation } from "../lib/conversation-bus.js";
import {
  buildMessageContent,
  getConversationForOrg,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
  serializeMessage,
} from "../lib/conversations.js";
import {
  assertWidgetConversation,
  createWidgetConversation,
  findOpenWidgetConversation,
  listWidgetMessages,
  resolveBrandBySlug,
  resolveOrgBySlug,
  widgetHmacSecret,
} from "../lib/widget.js";
import { requireWidgetAuth } from "../middleware/widget-auth.js";
import type { AppVariables } from "../types.js";

export function widgetRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/widget`;

  r.post(`${prefix}/session`, zValidator("json", widgetSessionSchema), async (c) => {
    const body = c.req.valid("json");
    const secret = widgetHmacSecret(c.get("env"));

    if (!verifyWidgetUserHash(secret, body.user.id, body.user.userHash)) {
      return c.json({ error: "invalid_user_hash" }, 401);
    }

    const org = await resolveOrgBySlug(c.get("store").db, body.orgSlug);
    if (!org) return c.json({ error: "org_not_found" }, 404);

    const brand = await resolveBrandBySlug(c.get("store").db, org.id, body.brandSlug);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const sessionId = randomToken();
    const accessToken = await signWidgetAccessToken(c.get("authConfig"), {
      sub: body.user.id,
      orgId: org.id,
      brandId: brand.id,
      sessionId,
    });

    const ttlSec = c.get("authConfig").widgetAccessTtlSec ?? c.get("authConfig").accessTtlSec;

    return c.json({
      accessToken,
      expiresIn: ttlSec,
      org: { id: org.id, slug: org.slug },
      brand: { id: brand.id, slug: brand.slug },
      user: { id: body.user.id, email: body.user.email, name: body.user.name },
    });
  });

  r.post(
    `${prefix}/conversations`,
    requireWidgetAuth(),
    zValidator("json", widgetCreateConversationSchema),
    async (c) => {
      const auth = c.get("widgetAuth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const db = c.get("store").db;

      const existing = await findOpenWidgetConversation(db, auth.orgId, auth.brandId, auth.sub);
      if (existing) {
        return c.json({ conversation: serializeConversation(existing), created: false });
      }

      const result = await createWidgetConversation(db, {
        orgId: auth.orgId,
        brandId: auth.brandId,
        userId: auth.sub,
        subject: body.subject,
        initialMessage: body.initialMessage,
      });

      return c.json(
        { conversation: result.conversation, message: result.message, created: true },
        201,
      );
    },
  );

  r.get(`${prefix}/conversations/:id`, requireWidgetAuth(), async (c) => {
    const auth = c.get("widgetAuth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    const denied = assertWidgetConversation(conversation, auth);
    if (denied === "not_found") return c.json({ error: "not_found" }, 404);
    if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

    return c.json({ conversation: serializeConversation(conversation) });
  });

  r.get(`${prefix}/conversations/:id/messages`, requireWidgetAuth(), async (c) => {
    const auth = c.get("widgetAuth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const conversation = await getConversationForOrg(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    const denied = assertWidgetConversation(conversation, auth);
    if (denied === "not_found") return c.json({ error: "not_found" }, 404);
    if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

    const items = await listWidgetMessages(c.get("store").db, conversation.id, auth.orgId, 100);
    return c.json({ items });
  });

  r.post(
    `${prefix}/conversations/:id/messages`,
    requireWidgetAuth(),
    zValidator("json", widgetPostMessageSchema),
    async (c) => {
      const auth = c.get("widgetAuth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      const denied = assertWidgetConversation(conversation, auth);
      if (denied === "not_found") return c.json({ error: "not_found" }, 404);
      if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

      const body = c.req.valid("json");
      const result = await insertMessage(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        senderType: "user",
        senderId: auth.sub,
        plainText: body.plainText,
        content: buildMessageContent(body.plainText),
        isInternal: false,
        sentVia: "messenger",
        isAgentReply: false,
      });

      const message = serializeMessage(result.message);

      await recordConversationEvent(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        eventType: "message.created",
        actorType: "user",
        actorId: auth.sub,
        payload: { messageId: message.id },
      });

      publishConversation({
        type: "message.created",
        conversationId: conversation.id,
        message,
      });

      return c.json({ message }, 201);
    },
  );

  return r;
}
