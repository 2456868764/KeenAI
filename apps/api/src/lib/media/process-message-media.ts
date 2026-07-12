import {
  type AttachmentMetadata,
  attachmentMetadataSchema,
  buildPlainTextFromParts,
} from "@keenai/shared";
import { attachments, messages } from "@keenai/storage/schema";
import { eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../types.js";
import {
  buildPartsMessageContent,
  extractPartsFromContent,
  loadAttachmentsForMessages,
} from "../attachments.js";
import { publishConversation } from "../conversation-bus.js";
import { serializeMessagesWithAttachments } from "../conversations.js";
import { readUploadFile } from "../uploads.js";
import { generateVideoThumbnail } from "./thumbnail.js";
import { transcribeAudio } from "./transcribe.js";

export type ProcessMessageMediaInput = {
  orgId: string;
  conversationId: string;
  messageId: string;
};

export type ProcessMessageMediaResult = {
  transcribed: number;
  thumbnailed: number;
  visionSummarized: number;
  textExtracted: number;
};

function parseAttachmentMetadata(raw: unknown): AttachmentMetadata {
  const parsed = attachmentMetadataSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export async function processMessageMedia(
  ctx: AppContext,
  input: ProcessMessageMediaInput,
): Promise<ProcessMessageMediaResult> {
  const db = ctx.store.db;
  const attachmentMap = await loadAttachmentsForMessages(db, [input.messageId]);
  const rows = attachmentMap.get(input.messageId) ?? [];
  let transcribed = 0;
  let thumbnailed = 0;
  let visionSummarized = 0;
  let textExtracted = 0;
  let needsPlainTextRefresh = false;

  for (const row of rows) {
    const mime = row.contentType?.toLowerCase() ?? "";
    const metadata = parseAttachmentMetadata(row.metadata);

    if (mime.startsWith("audio/") && !metadata.transcript?.trim()) {
      const data = await readUploadFile(ctx.env, row.storageKey);
      if (!data) continue;

      const { transcript } = await transcribeAudio(ctx.env, {
        data,
        contentType: row.contentType ?? "audio/webm",
        fileName: row.fileName,
      });

      await db
        .update(attachments)
        .set({
          metadata: {
            ...metadata,
            transcript,
            transcribedAt: new Date().toISOString(),
          },
        })
        .where(eq(attachments.id, row.id));

      transcribed++;
      needsPlainTextRefresh = true;
    }

    if (mime.startsWith("image/")) {
      const patch: AttachmentMetadata = { ...metadata };
      let changed = false;

      if (!row.thumbnailKey) {
        thumbnailed++;
      }

      if (!metadata.visionSummary?.trim()) {
        patch.visionSummary = summarizeImage(row.fileName, row.contentType, row.sizeBytes);
        patch.visionSummarizedAt = new Date().toISOString();
        visionSummarized++;
        needsPlainTextRefresh = true;
        changed = true;
      }

      const dimensions = inferImageDimensions(await readUploadFile(ctx.env, row.storageKey), mime);
      if (dimensions && (!metadata.width || !metadata.height)) {
        patch.width = dimensions.width;
        patch.height = dimensions.height;
        changed = true;
      }

      if (changed || !row.thumbnailKey) {
        await db
          .update(attachments)
          .set({
            thumbnailKey: row.thumbnailKey ?? row.storageKey,
            metadata: patch,
          })
          .where(eq(attachments.id, row.id));
      }
    }

    if (mime.startsWith("video/") && !row.thumbnailKey) {
      const data = await readUploadFile(ctx.env, row.storageKey);
      if (!data) continue;

      const thumb = await generateVideoThumbnail(ctx.env, {
        data,
        contentType: row.contentType ?? "video/mp4",
        fileName: row.fileName,
      });

      await db
        .update(attachments)
        .set({
          thumbnailKey: thumb.thumbnailKey,
          metadata: {
            ...metadata,
            ...(thumb.width ? { width: thumb.width } : {}),
            ...(thumb.height ? { height: thumb.height } : {}),
          },
        })
        .where(eq(attachments.id, row.id));

      thumbnailed++;
    }

    if (isExtractableTextMime(mime) && !metadata.extractedText?.trim()) {
      const data = await readUploadFile(ctx.env, row.storageKey);
      const extractedText = extractText(data, mime);
      if (extractedText) {
        await db
          .update(attachments)
          .set({
            metadata: {
              ...metadata,
              extractedText,
              extractedAt: new Date().toISOString(),
            },
          })
          .where(eq(attachments.id, row.id));
        textExtracted++;
        needsPlainTextRefresh = true;
      }
    }
  }

  if (transcribed === 0 && thumbnailed === 0 && visionSummarized === 0 && textExtracted === 0) {
    return { transcribed, thumbnailed, visionSummarized, textExtracted };
  }

  if (needsPlainTextRefresh) {
    await refreshMessagePlainText(db, input.messageId);
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);
  if (!message) return { transcribed, thumbnailed, visionSummarized, textExtracted };

  const [serialized] = await serializeMessagesWithAttachments(db, [message]);
  publishConversation({
    type: "message.updated",
    conversationId: input.conversationId,
    message: serialized,
  });

  return { transcribed, thumbnailed, visionSummarized, textExtracted };
}

async function refreshMessagePlainText(
  db: AppContext["store"]["db"],
  messageId: string,
): Promise<void> {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message) return;

  const parts = extractPartsFromContent(message.content);
  if (!parts || parts.length === 0) return;

  const attRows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, [messageId]));

  const attMap = new Map(
    attRows.map((a) => {
      const meta = parseAttachmentMetadata(a.metadata);
      return [
        a.id,
        {
          fileName: a.fileName,
          contentType: a.contentType,
          transcript: meta.transcript,
          visionSummary: meta.visionSummary,
          extractedText: meta.extractedText,
        },
      ] as const;
    }),
  );

  const plainText = buildPlainTextFromParts(parts, attMap);
  await db
    .update(messages)
    .set({
      plainText,
      content: buildPartsMessageContent(parts),
    })
    .where(eq(messages.id, messageId));
}

function summarizeImage(
  fileName: string | null,
  contentType: string | null,
  sizeBytes: number | null,
): string {
  const label = fileName?.trim() || "uploaded image";
  const mime = contentType?.trim() || "image";
  const size = typeof sizeBytes === "number" ? `, ${sizeBytes} bytes` : "";
  return `${label} (${mime}${size})`;
}

function isExtractableTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json" || mime === "application/pdf";
}

function extractText(data: Uint8Array | null, mime: string): string | null {
  if (!data || data.byteLength === 0) return null;
  if (mime === "application/pdf") {
    return `[PDF document: ${data.byteLength} bytes]`;
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(data).trim();
  return text ? text.slice(0, 200_000) : null;
}

function inferImageDimensions(
  data: Uint8Array | null,
  mime: string,
): { width: number; height: number } | null {
  if (!data || data.byteLength < 24) return null;
  if (mime === "image/png") return inferPngDimensions(data);
  if (mime === "image/gif") return inferGifDimensions(data);
  return null;
}

function inferPngDimensions(data: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => data[index] === byte)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function inferGifDimensions(data: Uint8Array): { width: number; height: number } | null {
  const header = String.fromCharCode(...data.slice(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  return width > 0 && height > 0 ? { width, height } : null;
}
