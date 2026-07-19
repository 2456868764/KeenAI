import { randomBytes } from "node:crypto";
import path from "node:path";
import type { ParsedInboundImMessage } from "@keenai/channels-im";
import {
  type ApiEnv,
  type MessageMetadata,
  type MessagePart,
  attachmentMetadataSchema,
  buildPlainTextFromParts,
  inferMessageKind,
} from "@keenai/shared";
import { conversations, messages } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import {
  buildPartsFromAttachments,
  buildPartsMessageContent,
  extractPartsFromContent,
  insertAttachment,
  linkAttachmentsToMessage,
  loadAttachmentsForMessages,
} from "./attachments.js";
import { publishConversation } from "./conversation-bus.js";
import {
  buildMessageContent,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
  serializeMessagesWithAttachments,
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
              : channelType === "whatsapp"
                ? `WhatsApp ${input.parsed.channelId}`
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

  const captionText = extractInboundCaptionText(input.parsed.parts);
  const parts =
    attachmentRows.length > 0 ? buildPartsFromAttachments(attachmentRows, captionText) : undefined;

  const replyContext = input.parsed.replyToMessageId
    ? await resolveImReplyContext(db, conversation.id, input.parsed.replyToMessageId)
    : null;
  const metadata: MessageMetadata = {
    platformMessageId: input.parsed.platformMessageId,
    ...(input.parsed.platformMessageId
      ? { platformMessageIds: [input.parsed.platformMessageId] }
      : {}),
    ...(input.parsed.replyToMessageId ? { replyToMessageId: input.parsed.replyToMessageId } : {}),
    ...(replyContext?.plainText ? { replyToPlainText: replyContext.plainText } : {}),
    ...(input.parsed.mediaGroupId ? { mediaGroupId: input.parsed.mediaGroupId } : {}),
  };

  const mergedAlbum =
    input.parsed.mediaGroupId && attachmentRows.length > 0
      ? await mergeIntoMediaGroupMessage(db, {
          orgId: input.orgId,
          conversationId: conversation.id,
          channelType,
          mediaGroupId: input.parsed.mediaGroupId,
          platformMessageId: input.parsed.platformMessageId,
          attachmentRows,
          caption: captionText,
        })
      : null;
  if (mergedAlbum) {
    const [full] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);

    return {
      created,
      conversation: full ? serializeConversation(full) : null,
      messageId: mergedAlbum.message.id,
      message: mergedAlbum.serialized,
      platformMessageId: input.parsed.platformMessageId,
    };
  }

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

  const { resumeCollectCustomerReplyForMessage } = await import("./workflow-resume.js");
  await resumeCollectCustomerReplyForMessage(
    db,
    {
      orgId: input.orgId,
      conversationId: conversation.id,
      messageId: message.id,
      plainText: message.plainText,
    },
    input.env,
  );

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

  const match = rows.find((row) => {
    const metadata = row.metadata as MessageMetadata;
    return (
      metadata.platformMessageId === platformMessageId ||
      metadata.platformMessageIds?.includes(platformMessageId)
    );
  });
  return match ? { messageId: match.id, plainText: match.plainText } : null;
}

async function mergeIntoMediaGroupMessage(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    conversationId: string;
    channelType: string;
    mediaGroupId: string;
    platformMessageId?: string;
    attachmentRows: Awaited<ReturnType<typeof insertAttachment>>[];
    caption?: string;
  },
) {
  const candidates = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        eq(messages.senderType, "user"),
        eq(messages.isInternal, false),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const existing = candidates.find((row) => row.metadata?.mediaGroupId === input.mediaGroupId);
  if (!existing) return null;

  await linkAttachmentsToMessage(
    db,
    input.orgId,
    existing.id,
    input.attachmentRows.map((a) => a.id),
  );

  const existingParts = extractPartsFromContent(existing.content) ?? [];
  const nextParts = buildPartsFromAttachments(input.attachmentRows, input.caption);
  const mergedParts = mergeAlbumParts(existingParts, nextParts);
  const attachmentMap = await loadAttachmentsForMessages(db, [existing.id]);
  const attachmentRows = attachmentMap.get(existing.id) ?? [];
  const plainText =
    buildPlainTextFromParts(mergedParts, buildAttachmentTextMap(attachmentRows)) ||
    existing.plainText;
  const platformMessageIds = collectPlatformMessageIds(
    existing.metadata as MessageMetadata,
    input.platformMessageId,
  );
  const metadata: MessageMetadata = {
    ...(existing.metadata as MessageMetadata),
    mediaGroupId: input.mediaGroupId,
    ...(platformMessageIds.length > 0 ? { platformMessageIds } : {}),
    messageKind: inferMessageKind(mergedParts),
    enrichmentStatus: "pending",
  };

  const [message] = await db
    .update(messages)
    .set({
      plainText,
      content: buildPartsMessageContent(mergedParts),
      contentFormat: "parts",
      sentVia: input.channelType,
      metadata,
    })
    .where(eq(messages.id, existing.id))
    .returning();

  if (!message) throw new Error("message_album_merge_failed");

  const [conversation] = await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId))
    .returning();

  const { getMediaDispatch } = await import("./media-dispatch-init.js");
  await getMediaDispatch().enqueueMessageMedia({
    orgId: input.orgId,
    conversationId: input.conversationId,
    messageId: message.id,
  });

  const [updatedMessage] = await db.select().from(messages).where(eq(messages.id, message.id));
  const [serialized] = await serializeMessagesWithAttachments(db, [updatedMessage ?? message]);
  const payload = serialized ?? updatedMessage ?? message;

  publishConversation({
    type: "message.updated",
    conversationId: input.conversationId,
    message: payload,
  });

  if (conversation) {
    publishConversation({
      type: "conversation.updated",
      conversationId: input.conversationId,
      conversation: serializeConversation(conversation),
    });
  }

  return { message: updatedMessage ?? message, serialized: payload };
}

function mergeAlbumParts(existingParts: MessagePart[], nextParts: MessagePart[]): MessagePart[] {
  const merged = [...existingParts];
  for (const part of nextParts) {
    if (part.type === "text") {
      if (part.text.trim()) merged.push(part);
      continue;
    }
    if (!merged.some((p) => p.type !== "text" && p.attachmentId === part.attachmentId)) {
      merged.push(part);
    }
  }
  return merged;
}

function buildAttachmentTextMap(
  rows: {
    id: string;
    fileName: string | null;
    contentType: string | null;
    metadata: Record<string, unknown>;
  }[],
) {
  return new Map(
    rows.map((row) => {
      const meta = attachmentMetadataSchema.safeParse(row.metadata ?? {});
      return [
        row.id,
        {
          fileName: row.fileName,
          contentType: row.contentType,
          transcript: meta.success ? meta.data.transcript : undefined,
          visionSummary: meta.success ? meta.data.visionSummary : undefined,
          extractedText: meta.success ? meta.data.extractedText : undefined,
        },
      ] as const;
    }),
  );
}

function collectPlatformMessageIds(
  metadata: MessageMetadata,
  platformMessageId: string | undefined,
): string[] {
  return [
    ...new Set([
      ...(metadata.platformMessageIds ?? []),
      ...(metadata.platformMessageId ? [metadata.platformMessageId] : []),
      ...(platformMessageId ? [platformMessageId] : []),
    ]),
  ];
}

function extractInboundCaptionText(parts: MessagePart[]): string | undefined {
  return parts.find((part) => part.type === "text")?.text;
}
