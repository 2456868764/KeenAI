import { randomBytes } from "node:crypto";
import path from "node:path";
import type { ParsedInboundImMessage } from "@keenai/channels-im";
import type { ApiEnv, MessageMetadata } from "@keenai/shared";
import { conversations, messages } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
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
        : channelType === "discord"
          ? `Discord ${input.parsed.channelId}`
          : channelType === "feishu"
            ? `Feishu ${input.parsed.channelId}`
            : channelType === "dingtalk"
              ? `DingTalk ${input.parsed.channelId}`
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
        attributes: input.parsed.conversationAttributes ?? {},
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
  } else if (input.parsed.conversationAttributes) {
    const [existingRow] = await db
      .select({ attributes: conversations.attributes })
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    await db
      .update(conversations)
      .set({
        attributes: {
          ...(existingRow?.attributes ?? {}),
          ...input.parsed.conversationAttributes,
        },
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));
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

  const replyContext = input.parsed.replyToMessageId
    ? await resolveImReplyContext(db, conversation.id, input.parsed.replyToMessageId)
    : null;
  const metadata: MessageMetadata = {
    platformMessageId: input.parsed.platformMessageId,
    ...(input.parsed.replyToMessageId ? { replyToMessageId: input.parsed.replyToMessageId } : {}),
    ...(replyContext?.plainText ? { replyToPlainText: replyContext.plainText } : {}),
    ...(input.parsed.mediaGroupId ? { mediaGroupId: input.parsed.mediaGroupId } : {}),
  };

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
    inReplyTo: replyContext?.messageId,
    sentVia: channelType,
    isAgentReply: false,
    metadata,
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

async function resolveImReplyContext(
  db: AppVariables["store"]["db"],
  conversationId: string,
  platformMessageId: string,
): Promise<{ messageId: string; plainText: string } | null> {
  const rows = await db
    .select({
      id: messages.id,
      plainText: messages.plainText,
      metadata: messages.metadata,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  const match = rows.find((row) => row.metadata?.platformMessageId === platformMessageId);
  return match ? { messageId: match.id, plainText: match.plainText } : null;
}
