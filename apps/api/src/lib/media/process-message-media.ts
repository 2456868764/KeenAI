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
  }

  if (transcribed === 0 && thumbnailed === 0) {
    return { transcribed, thumbnailed };
  }

  if (needsPlainTextRefresh) {
    await refreshMessagePlainText(db, input.messageId);
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);
  if (!message) return { transcribed, thumbnailed };

  const [serialized] = await serializeMessagesWithAttachments(db, [message]);
  publishConversation({
    type: "message.updated",
    conversationId: input.conversationId,
    message: serialized,
  });

  return { transcribed, thumbnailed };
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
