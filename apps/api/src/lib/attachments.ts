import type { MessagePart, SerializedAttachment } from "@keenai/shared";
import { attachmentMetadataSchema } from "@keenai/shared";
import { attachments, conversations, messages } from "@keenai/storage/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppVariables } from "../types.js";

type Db = AppVariables["store"]["db"];
type AttachmentRow = typeof attachments.$inferSelect;

export function serializeAttachment(
  row: AttachmentRow,
  opts?: { contentUrl?: string },
): SerializedAttachment {
  const metadataParsed = attachmentMetadataSchema.safeParse(row.metadata ?? {});
  const metadata = metadataParsed.success ? metadataParsed.data : undefined;
  const hasMeta = metadata && Object.keys(metadata).length > 0;

  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    url: opts?.contentUrl,
    metadata: hasMeta ? metadata : undefined,
  };
}

export function attachmentContentPath(id: string): string {
  return `/api/v1/attachments/${id}/content`;
}

export async function insertAttachment(
  db: Db,
  input: {
    orgId: string;
    storageKey: string;
    fileName?: string;
    contentType?: string;
    sizeBytes?: number;
    messageId?: string;
  },
): Promise<AttachmentRow> {
  const [row] = await db
    .insert(attachments)
    .values({
      orgId: input.orgId,
      messageId: input.messageId,
      storageKey: input.storageKey,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    })
    .returning();
  if (!row) throw new Error("attachment_insert_failed");
  return row;
}

export async function loadPendingAttachments(
  db: Db,
  orgId: string,
  attachmentIds: string[],
): Promise<AttachmentRow[]> {
  if (attachmentIds.length === 0) return [];
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.orgId, orgId),
        inArray(attachments.id, attachmentIds),
        isNull(attachments.messageId),
      ),
    );
}

export async function linkAttachmentsToMessage(
  db: Db,
  orgId: string,
  messageId: string,
  attachmentIds: string[],
): Promise<void> {
  if (attachmentIds.length === 0) return;
  await db
    .update(attachments)
    .set({ messageId })
    .where(
      and(
        eq(attachments.orgId, orgId),
        inArray(attachments.id, attachmentIds),
        isNull(attachments.messageId),
      ),
    );
}

export async function loadAttachmentsForMessages(
  db: Db,
  messageIds: string[],
): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (messageIds.length === 0) return map;

  const rows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds));

  for (const row of rows) {
    if (!row.messageId) continue;
    const list = map.get(row.messageId) ?? [];
    list.push(row);
    map.set(row.messageId, list);
  }
  return map;
}

export async function getAttachmentById(db: Db, id: string, orgId: string) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export function buildPartsFromAttachments(rows: AttachmentRow[], caption?: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const text = caption?.trim();
  if (text) parts.push({ type: "text", text });

  for (const row of rows) {
    const mime = row.contentType?.toLowerCase() ?? "";
    if (mime.startsWith("image/")) {
      parts.push({ type: "image", attachmentId: row.id });
    } else if (mime.startsWith("audio/")) {
      parts.push({ type: "audio", attachmentId: row.id });
    } else if (mime.startsWith("video/")) {
      parts.push({ type: "video", attachmentId: row.id });
    } else {
      parts.push({
        type: "file",
        attachmentId: row.id,
        fileName: row.fileName ?? "attachment",
      });
    }
  }
  return parts;
}

export function extractPartsFromContent(content: Record<string, unknown>): MessagePart[] | null {
  if (content.type === "parts" && Array.isArray(content.parts)) {
    return content.parts as MessagePart[];
  }
  if (content.type === "text" && typeof content.text === "string") {
    return [{ type: "text", text: content.text }];
  }
  return null;
}

export function buildPartsMessageContent(parts: MessagePart[]): Record<string, unknown> {
  return { type: "parts", parts };
}

export async function loadAttachmentAccessContext(db: Db, attachmentId: string) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) return null;

  if (!row.messageId) {
    return { attachment: row, conversation: null as typeof conversations.$inferSelect | null };
  }

  const [message] = await db.select().from(messages).where(eq(messages.id, row.messageId)).limit(1);
  if (!message) return { attachment: row, conversation: null };

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, message.conversationId))
    .limit(1);

  return { attachment: row, conversation: conversation ?? null, message };
}

export function enrichSerializedMessages<
  T extends { id: string; content: Record<string, unknown>; metadata: Record<string, unknown> },
>(
  rows: T[],
  attachmentMap: Map<string, AttachmentRow[]>,
  baseSerialize: (row: T) => Record<string, unknown>,
) {
  return rows.map((row) => {
    const atts = attachmentMap.get(row.id) ?? [];
    const parts = extractPartsFromContent(row.content);
    const messageKind =
      typeof row.metadata.messageKind === "string" ? row.metadata.messageKind : undefined;
    return {
      ...baseSerialize(row),
      parts,
      messageKind,
      attachments: atts.map((a) =>
        serializeAttachment(a, { contentUrl: attachmentContentPath(a.id) }),
      ),
    };
  });
}
