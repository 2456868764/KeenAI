import { zValidator } from "@hono/zod-validator";
import { randomToken, signWidgetAccessToken, verifyWidgetUserHash } from "@keenai/auth";
import {
  API_VERSION,
  presignUploadSchema,
  widgetConversationRatingSchema,
  widgetCreateConversationSchema,
  widgetPostMessageSchema,
  widgetSessionSchema,
  widgetWorkflowInputSchema,
} from "@keenai/shared";
import { conversations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { insertAttachment } from "../lib/attachments.js";
import {
  getConversationForOrg,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
} from "../lib/conversations.js";
import { getKbDispatch } from "../lib/kb-dispatch-init.js";
import { dispatchKbConversationClosed } from "../lib/kb-dispatch.js";
import {
  consumePresignedUpload,
  createPresignedUpload,
  fileChecksum,
  saveUploadFile,
} from "../lib/uploads.js";
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
    if (denied === "not_found" || !conversation) return c.json({ error: "not_found" }, 404);
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
    if (denied === "not_found" || !conversation) return c.json({ error: "not_found" }, 404);
    if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

    const items = await listWidgetMessages(c.get("store").db, conversation.id, auth.orgId, 100);
    return c.json({ items });
  });

  r.post(
    `${prefix}/uploads/presign`,
    requireWidgetAuth(),
    zValidator("json", presignUploadSchema),
    async (c) => {
      const auth = c.get("widgetAuth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      try {
        const apiBase = new URL(c.req.url).origin;
        const presigned = createPresignedUpload(c.get("env"), body, apiBase);
        return c.json(presigned, 201);
      } catch (e) {
        if (e instanceof Error && e.message === "file_too_large") {
          return c.json({ error: "file_too_large", maxBytes: c.get("env").UPLOAD_MAX_BYTES }, 413);
        }
        throw e;
      }
    },
  );

  r.put(`${prefix}/uploads/:uploadId`, requireWidgetAuth(), async (c) => {
    const auth = c.get("widgetAuth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const entry = consumePresignedUpload(c.req.param("uploadId"));
    if (!entry) return c.json({ error: "invalid_or_expired_upload" }, 410);

    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength > c.get("env").UPLOAD_MAX_BYTES) {
      return c.json({ error: "file_too_large", maxBytes: c.get("env").UPLOAD_MAX_BYTES }, 413);
    }

    await saveUploadFile(c.get("env"), entry.storageKey, buf);

    const attachment = await insertAttachment(c.get("store").db, {
      orgId: auth.orgId,
      storageKey: entry.storageKey,
      fileName: entry.fileName,
      contentType: entry.contentType,
      sizeBytes: buf.byteLength,
    });

    return c.json({
      attachmentId: attachment.id,
      storageKey: entry.storageKey,
      contentType: entry.contentType,
      sizeBytes: buf.byteLength,
      checksum: fileChecksum(buf),
    });
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
      if (denied === "not_found" || !conversation) return c.json({ error: "not_found" }, 404);
      if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

      const body = c.req.valid("json");
      const result = await insertMessage(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        senderType: "user",
        senderId: auth.sub,
        plainText: body.plainText,
        attachmentIds: body.attachmentIds,
        parts: body.parts,
        isInternal: false,
        sentVia: "messenger",
        isAgentReply: false,
      });

      const message = result.serialized;

      await recordConversationEvent(c.get("store").db, {
        orgId: auth.orgId,
        conversationId: conversation.id,
        eventType: "message.created",
        actorType: "user",
        actorId: auth.sub,
        payload: { messageId: result.message.id },
      });

      return c.json({ message }, 201);
    },
  );

  r.post(
    `${prefix}/conversations/:id/rating`,
    requireWidgetAuth(),
    zValidator("json", widgetConversationRatingSchema),
    async (c) => {
      const auth = c.get("widgetAuth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      const denied = assertWidgetConversation(conversation, auth);
      if (denied === "not_found" || !conversation) return c.json({ error: "not_found" }, 404);
      if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

      const body = c.req.valid("json");
      const now = new Date();
      const [updated] = await c
        .get("store")
        .db.update(conversations)
        .set({
          rating: body.rating,
          ratingComment: body.ratingComment ?? null,
          updatedAt: now,
        })
        .where(eq(conversations.id, conversation.id))
        .returning();

      if (!updated) return c.json({ error: "update_failed" }, 500);

      if (updated.status === "closed") {
        try {
          await dispatchKbConversationClosed(getKbDispatch(), c.get("store").db, {
            orgId: auth.orgId,
            brandId: conversation.brandId,
            conversationId: conversation.id,
          });
        } catch {
          // KB crystallize is best-effort after CSAT
        }
      }

      return c.json({ conversation: serializeConversation(updated) });
    },
  );

  r.post(
    `${prefix}/conversations/:id/workflow-input`,
    requireWidgetAuth(),
    zValidator("json", widgetWorkflowInputSchema),
    async (c) => {
      const auth = c.get("widgetAuth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const conversation = await getConversationForOrg(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
      );
      const denied = assertWidgetConversation(conversation, auth);
      if (denied === "not_found" || !conversation) return c.json({ error: "not_found" }, 404);
      if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);

      const body = c.req.valid("json");
      const { resumeCollectDataWorkflow } = await import("../lib/workflow-resume.js");
      const result = await resumeCollectDataWorkflow(
        c.get("store").db,
        {
          orgId: auth.orgId,
          workflowRunId: body.workflowRunId,
          blockId: body.blockId,
          attributes: body.attributes,
          freeText: body.freeText,
        },
        c.get("env"),
        c.get("authConfig"),
      );

      if (!result.resumed) {
        return c.json({ error: result.reason ?? "resume_failed" }, 400);
      }

      return c.json({ ok: true, status: result.status });
    },
  );

  return r;
}
