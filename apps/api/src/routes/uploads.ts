import { zValidator } from "@hono/zod-validator";
import { API_VERSION, presignUploadSchema } from "@keenai/shared";
import { Hono } from "hono";
import { insertAttachment } from "../lib/attachments.js";
import {
  consumePresignedUpload,
  createPresignedUpload,
  fileChecksum,
  guessContentType,
  readUploadFile,
  saveUploadFile,
} from "../lib/uploads.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function uploadRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/uploads`;

  r.post(`${prefix}/presign`, requireAuth(), zValidator("json", presignUploadSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    try {
      const apiBase = new URL(c.req.url).origin;
      const presigned = createPresignedUpload(ctx.env, body, apiBase);
      return c.json(presigned, 201);
    } catch (e) {
      if (e instanceof Error && e.message === "file_too_large") {
        return c.json({ error: "file_too_large", maxBytes: ctx.env.UPLOAD_MAX_BYTES }, 413);
      }
      throw e;
    }
  });

  r.put(`${prefix}/:uploadId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const entry = consumePresignedUpload(c.req.param("uploadId"));
    if (!entry) return c.json({ error: "invalid_or_expired_upload" }, 410);

    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength > ctx.env.UPLOAD_MAX_BYTES) {
      return c.json({ error: "file_too_large", maxBytes: ctx.env.UPLOAD_MAX_BYTES }, 413);
    }

    await saveUploadFile(ctx.env, entry.storageKey, buf);

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

  r.get(`${prefix}/file/:storageKey`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const storageKey = c.req.param("storageKey");
    const buf = await readUploadFile(ctx.env, storageKey);
    if (!buf) return c.json({ error: "not_found" }, 404);

    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": guessContentType(storageKey),
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  return r;
}
