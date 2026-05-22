import { randomBytes } from "node:crypto";
import path from "node:path";
import type { ParsedInboundImMessage } from "@keenai/channels-im";
import type { ApiEnv } from "@keenai/shared";
import { conversations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { buildPartsFromAttachments, insertAttachment } from "./attachments.js";
import {
  buildMessageContent,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
} from "./conversations.js";
import { downloadImAttachment } from "./im-download.js";
import { saveUploadFile } from "./uploads.js";

export async function ingestInboundIm(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    parsed: ParsedInboundImMessage;
    env: ApiEnv;
  },
) {
  const channelType = input.parsed.channelType;

  const [existing] = await db
    .select({
      id: conversations.id,
      channelId: conversations.channelId,
      subject: conversations.subject,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
        eq(conversations.channelType, channelType),
        eq(conversations.channelId, input.parsed.channelId),
      ),
    )
    .limit(1);

  let conversation = existing;
  let created = false;

  if (!conversation) {
    const subject =
      channelType === "telegram"
        ? `Telegram ${input.parsed.channelId}`
        : `Slack ${input.parsed.channelId}`;

    const [row] = await db
      .insert(conversations)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        userId: input.parsed.userId,
        channelType,
        channelId: input.parsed.channelId,
        subject,
        status: "open",
        lastMessageAt: new Date(),
        messageCount: 1,
        unreadCount: 1,
      })
      .returning({ id: conversations.id, channelId: conversations.channelId });

    if (!row) throw new Error("conversation_create_failed");
    conversation = { id: row.id, channelId: row.channelId, subject };
    created = true;

    await recordConversationEvent(db, {
      orgId: input.orgId,
      conversationId: row.id,
      eventType: "conversation.created",
      actorType: "user",
      actorId: input.parsed.userId,
      payload: { channel: channelType },
    });
  }

  const attachmentRows = [];
  for (const file of input.parsed.attachments) {
    const content = await downloadImAttachment(input.env, file);
    const ext = path.extname(file.fileName).slice(0, 32) || ".bin";
    const storageKey = `${randomBytes(16).toString("hex")}${ext}`;
    await saveUploadFile(input.env, storageKey, content);
    const row = await insertAttachment(db, {
      orgId: input.orgId,
      storageKey,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: content.byteLength,
      metadata: { source: "im_download", platformRef: file.platformRef },
    });
    attachmentRows.push(row);
  }

  const parts =
    attachmentRows.length > 0
      ? buildPartsFromAttachments(attachmentRows, input.parsed.plainText)
      : undefined;

  const { message, serialized } = await insertMessage(db, {
    orgId: input.orgId,
    conversationId: conversation.id,
    senderType: "user",
    senderId: input.parsed.userId,
    plainText: input.parsed.plainText,
    content: parts ? undefined : buildMessageContent(input.parsed.plainText),
    attachmentIds: attachmentRows.length > 0 ? attachmentRows.map((a) => a.id) : undefined,
    parts,
    isInternal: false,
    sentVia: channelType,
    isAgentReply: false,
  });

  const [full] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversation.id))
    .limit(1);

  return {
    created,
    conversation: full ? serializeConversation(full) : null,
    messageId: message.id,
    message: serialized,
    platformMessageId: input.parsed.platformMessageId,
  };
}
