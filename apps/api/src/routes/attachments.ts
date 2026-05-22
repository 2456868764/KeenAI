import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  getAttachmentById,
  loadAttachmentAccessContext,
  serializeAttachment,
} from "../lib/attachments.js";
import { canAccessBrand } from "../lib/conversations.js";
import { guessContentType, readUploadFile } from "../lib/uploads.js";
import { assertWidgetConversation } from "../lib/widget.js";
import type { AppContext, AppVariables } from "../types.js";

type AttachmentContext = Context<{ Variables: AppVariables }>;

export function attachmentRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/attachments`;

  r.get(`${prefix}/:id`, async (c) => {
    const denied = await assertAttachmentAccess(c);
    if (denied) return denied;

    const orgId = resolveOrgId(c);
    if (!orgId) return c.json({ error: "unauthorized" }, 401);

    const row = await getAttachmentById(c.get("store").db, c.req.param("id"), orgId);
    if (!row) return c.json({ error: "not_found" }, 404);

    return c.json({
      attachment: serializeAttachment(row, {
        contentUrl: `${prefix}/${row.id}/content`,
        thumbnailUrl: row.thumbnailKey ? `${prefix}/${row.id}/thumbnail` : undefined,
      }),
    });
  });

  r.get(`${prefix}/:id/thumbnail`, async (c) => {
    const denied = await assertAttachmentAccess(c);
    if (denied) return denied;

    const orgId = resolveOrgId(c);
    if (!orgId) return c.json({ error: "unauthorized" }, 401);

    const row = await getAttachmentById(c.get("store").db, c.req.param("id"), orgId);
    if (!row?.thumbnailKey) return c.json({ error: "not_found" }, 404);

    const buf = await readUploadFile(ctx.env, row.thumbnailKey);
    if (!buf) return c.json({ error: "not_found" }, 404);

    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": guessContentType(row.thumbnailKey),
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  r.get(`${prefix}/:id/content`, async (c) => {
    const denied = await assertAttachmentAccess(c);
    if (denied) return denied;

    const orgId = resolveOrgId(c);
    if (!orgId) return c.json({ error: "unauthorized" }, 401);

    const row = await getAttachmentById(c.get("store").db, c.req.param("id"), orgId);
    if (!row) return c.json({ error: "not_found" }, 404);

    const buf = await readUploadFile(ctx.env, row.storageKey);
    if (!buf) return c.json({ error: "not_found" }, 404);

    const contentType = row.contentType ?? guessContentType(row.storageKey);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  return r;
}

function resolveOrgId(c: AttachmentContext): string | null {
  return c.get("auth")?.orgId ?? c.get("widgetAuth")?.orgId ?? null;
}

async function assertAttachmentAccess(c: AttachmentContext): Promise<Response | null> {
  const auth = c.get("auth");
  const widgetAuth = c.get("widgetAuth");
  if (!auth && !widgetAuth) return c.json({ error: "unauthorized" }, 401);

  const attachmentId = c.req.param("id");
  if (!attachmentId) return c.json({ error: "not_found" }, 404);

  const access = await loadAttachmentAccessContext(c.get("store").db, attachmentId);
  if (!access) return c.json({ error: "not_found" }, 404);

  const { attachment, conversation, message } = access;

  if (auth) {
    if (auth.orgId !== attachment.orgId) return c.json({ error: "not_found" }, 404);
    if (!conversation) return null;
    if (!canAccessBrand(auth, conversation.brandId)) return c.json({ error: "forbidden" }, 403);
    return null;
  }

  if (widgetAuth) {
    if (widgetAuth.orgId !== attachment.orgId) return c.json({ error: "not_found" }, 404);
    if (!conversation) return c.json({ error: "not_found" }, 404);
    const denied = assertWidgetConversation(conversation, widgetAuth);
    if (denied === "not_found") return c.json({ error: "not_found" }, 404);
    if (denied === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (message?.isInternal) return c.json({ error: "not_found" }, 404);
    return null;
  }

  return c.json({ error: "unauthorized" }, 401);
}
