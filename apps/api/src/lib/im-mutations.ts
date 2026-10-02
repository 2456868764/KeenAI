import type { ParsedInboundImMessage } from "@keenai/channels-im";
import {
  type ApiEnv,
  type MessagePart,
  buildPlainTextFromParts,
  inferMessageKind,
} from "@keenai/shared";
import {
  attachments,
  channelMessageLinks,
  conversations,
  messages,
  reactions,
} from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import {
  buildPartsFromAttachments,
  buildPartsMessageContent,
  extractPartsFromContent,
  linkAttachmentsToMessage,
  loadAttachmentsForMessages,
} from "./attachments.js";
import { publishConversation } from "./conversation-bus.js";
import { recordConversationEvent, serializeMessagesWithAttachments } from "./conversations.js";
import { materializeImAttachments } from "./im-ingest.js";
import {
  invalidateMemoryTreeForMessage,
  refreshMemoryTreeForMessage,
} from "./memory-tree-ingest.js";

type Database = AppVariables["store"]["db"];

export class ImMutationTargetNotFoundError extends Error {
  constructor() {
    super("im_mutation_target_not_found");
    this.name = "ImMutationTargetNotFoundError";
  }
}

export async function findImMutationConversation(
  db: Database,
  input: { orgId: string; connectionId: string; providerMessageId: string },
) {
  const [row] = await db
    .select({
      id: conversations.id,
      channelId: conversations.channelId,
      subject: conversations.subject,
    })
    .from(channelMessageLinks)
    .innerJoin(conversations, eq(conversations.id, channelMessageLinks.conversationId))
    .where(
      and(
        eq(channelMessageLinks.connectionId, input.connectionId),
        eq(channelMessageLinks.providerMessageId, input.providerMessageId),
        eq(conversations.orgId, input.orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function applyInboundImMutation(
  db: Database,
  input: {
    orgId: string;
    connectionId: string;
    conversationId: string;
    parsed: ParsedInboundImMessage;
    env: ApiEnv;
    channelCredentials?: Record<string, unknown>;
  },
) {
  const mutation = input.parsed.mutation;
  if (!mutation) throw new Error("im_mutation_missing");
  const [target] = await db
    .select({ message: messages, conversation: conversations })
    .from(channelMessageLinks)
    .innerJoin(messages, eq(messages.id, channelMessageLinks.messageId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(channelMessageLinks.connectionId, input.connectionId),
        eq(channelMessageLinks.providerMessageId, mutation.targetProviderMessageId),
        eq(channelMessageLinks.conversationId, input.conversationId),
        eq(messages.orgId, input.orgId),
      ),
    )
    .limit(1);
  if (!target) throw new ImMutationTargetNotFoundError();

  const messageId = target.message.id;
  const now = new Date();
  if (mutation.type === "message.updated") {
    const replacementRows = mutation.replaceAttachments
      ? await materializeImAttachments(db, {
          orgId: input.orgId,
          attachments: input.parsed.attachments,
          env: input.env,
          channelCredentials: input.channelCredentials,
        })
      : null;
    if (replacementRows) {
      await db
        .update(attachments)
        .set({ messageId: null })
        .where(eq(attachments.messageId, messageId));
      if (replacementRows.length > 0) {
        await linkAttachmentsToMessage(
          db,
          input.orgId,
          messageId,
          replacementRows.map((row) => row.id),
        );
      }
    }

    const attachmentRows =
      replacementRows ?? (await loadAttachmentsForMessages(db, [messageId])).get(messageId) ?? [];
    const text = inboundText(input.parsed);
    const parts = replacementRows
      ? buildPartsFromAttachments(replacementRows, text)
      : replaceTextParts(extractPartsFromContent(target.message.content) ?? [], text);
    const attachmentText = new Map(
      attachmentRows.map((row) => [
        row.id,
        { fileName: row.fileName, contentType: row.contentType },
      ]),
    );
    const plainText = buildPlainTextFromParts(parts, attachmentText);
    await db
      .update(messages)
      .set({
        content: buildPartsMessageContent(parts),
        contentFormat: "parts",
        plainText,
        editedAt: now,
        metadata: {
          ...target.message.metadata,
          messageKind: inferMessageKind(parts),
        },
      })
      .where(eq(messages.id, messageId));
    await refreshMemoryTreeForMessage(db, {
      orgId: input.orgId,
      brandId: target.conversation.brandId,
      conversationId: input.conversationId,
      messageId,
      senderType: target.message.senderType,
      plainText,
      isInternal: target.message.isInternal,
      createdAt: target.message.createdAt,
      channelType: target.conversation.channelType ?? undefined,
      channelId: target.conversation.channelId ?? undefined,
    });
    if (replacementRows && replacementRows.length > 0) {
      const { getMediaDispatch } = await import("./media-dispatch-init.js");
      await getMediaDispatch().enqueueMessageMedia({
        orgId: input.orgId,
        conversationId: input.conversationId,
        messageId,
      });
    }
  } else if (mutation.type === "message.deleted") {
    await db.update(messages).set({ deletedAt: now }).where(eq(messages.id, messageId));
    await invalidateMemoryTreeForMessage(db, {
      orgId: input.orgId,
      brandId: target.conversation.brandId,
      messageId,
    });
  } else if (mutation.type === "reaction.added") {
    await db
      .insert(reactions)
      .values({
        messageId,
        actorType: "user",
        actorId: mutation.actorId,
        emoji: mutation.emoji,
        createdAt: now,
      })
      .onConflictDoNothing();
  } else if (mutation.type === "reaction.removed") {
    const filters = [
      eq(reactions.messageId, messageId),
      eq(reactions.actorType, "user"),
      eq(reactions.actorId, mutation.actorId),
    ];
    if (mutation.emoji !== "*") filters.push(eq(reactions.emoji, mutation.emoji));
    await db.delete(reactions).where(and(...filters));
  } else if (mutation.type === "reactions.replaced") {
    await db
      .delete(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.actorType, "user"),
          eq(reactions.actorId, mutation.actorId),
        ),
      );
    if (mutation.newEmojis.length > 0) {
      await db
        .insert(reactions)
        .values(
          mutation.newEmojis.map((emoji) => ({
            messageId,
            actorType: "user",
            actorId: mutation.actorId,
            emoji,
            createdAt: now,
          })),
        )
        .onConflictDoNothing();
    }
  } else {
    throw new Error("unsupported_im_mutation");
  }

  await recordConversationEvent(db, {
    orgId: input.orgId,
    conversationId: input.conversationId,
    eventType: mutation.type,
    actorType: "user",
    actorId:
      "actorId" in mutation && typeof mutation.actorId === "string"
        ? mutation.actorId
        : input.parsed.userId,
    payload: {
      messageId,
      providerMessageId: mutation.targetProviderMessageId,
      ...(mutation.type.startsWith("reaction") ? { mutation } : {}),
    },
  });

  const [updated] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!updated) throw new ImMutationTargetNotFoundError();
  const [serialized] = await serializeMessagesWithAttachments(db, [updated]);
  const message = serialized ?? updated;
  publishConversation({
    type: "message.updated",
    conversationId: input.conversationId,
    message,
  });
  return { messageId, message, mutation: mutation.type };
}

function inboundText(parsed: ParsedInboundImMessage): string {
  const text = parsed.parts.find((part) => part.type === "text");
  if (text?.type === "text") return text.text;
  return parsed.attachments.length > 0 ? "" : parsed.plainText;
}

function replaceTextParts(existing: MessagePart[], text: string): MessagePart[] {
  const media = existing.filter((part) => part.type !== "text");
  return text.trim() ? [{ type: "text" as const, text }, ...media] : media;
}
