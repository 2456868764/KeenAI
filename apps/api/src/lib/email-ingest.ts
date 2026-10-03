import { randomBytes } from "node:crypto";
import path from "node:path";
import type {
  ParsedEmailAttachment,
  ParsedInboundEmailWithAttachments,
} from "@keenai/channels-email";
import { resolveThreadChannelId } from "@keenai/channels-email";
import type { ApiEnv } from "@keenai/shared";
import {
  channelConversationLinks,
  channelMessageLinks,
  conversations,
} from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { buildPartsFromAttachments, insertAttachment } from "./attachments.js";
import {
  buildMessageContent,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
} from "./conversations.js";
import { saveUploadFile } from "./uploads.js";

type DurableInboundEmail = Omit<ParsedInboundEmailWithAttachments, "attachments"> & {
  attachments: Array<{
    fileName: string;
    contentType: string;
    sizeBytes: number;
    contentBase64: string;
  }>;
};

export function limitInboundEmailAttachments(
  parsed: ParsedInboundEmailWithAttachments,
  maxBytes: number,
): ParsedInboundEmailWithAttachments {
  const attachments: ParsedEmailAttachment[] = [];
  const omitted: string[] = [];

  for (const attachment of parsed.attachments) {
    const actualSize = attachment.content.byteLength;
    if (actualSize > maxBytes) {
      const safeName = attachment.fileName.replace(/[\r\n\[\]]/g, "_").slice(0, 128);
      omitted.push(`[Attachment omitted: ${safeName} exceeds ${formatByteLimit(maxBytes)}]`);
      continue;
    }
    attachments.push({ ...attachment, sizeBytes: actualSize });
  }

  if (omitted.length === 0) return { ...parsed, attachments };
  return {
    ...parsed,
    plainText: [parsed.plainText, ...omitted].filter(Boolean).join("\n\n"),
    attachments,
  };
}

function formatByteLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.floor(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.floor(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function serializeInboundEmail(
  parsed: ParsedInboundEmailWithAttachments,
): DurableInboundEmail {
  return {
    ...parsed,
    attachments: parsed.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      contentBase64: attachment.content.toString("base64"),
    })),
  };
}

export function deserializeInboundEmail(payload: unknown): ParsedInboundEmailWithAttachments {
  if (!payload || typeof payload !== "object") throw new Error("invalid_email_ingress_payload");
  const parsed = payload as DurableInboundEmail;
  if (
    typeof parsed.messageId !== "string" ||
    typeof parsed.plainText !== "string" ||
    !parsed.from ||
    typeof parsed.from.address !== "string" ||
    !Array.isArray(parsed.attachments)
  ) {
    throw new Error("invalid_email_ingress_payload");
  }
  return {
    ...parsed,
    attachments: parsed.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      content: Buffer.from(attachment.contentBase64, "base64"),
    })),
  };
}

export async function ingestInboundEmail(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    parsed: ParsedInboundEmailWithAttachments;
    env: ApiEnv;
    conversation?: EnsuredEmailConversation;
  },
) {
  const parsed = limitInboundEmailAttachments(input.parsed, input.env.UPLOAD_MAX_BYTES);
  const ensured =
    input.conversation ??
    (await ensureInboundEmailConversation(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      parsed,
    }));
  const conversation = ensured.conversation;
  const created = ensured.created;

  const attachmentRows = [];
  for (const file of parsed.attachments) {
    const ext = path.extname(file.fileName).slice(0, 32);
    const storageKey = `${randomBytes(16).toString("hex")}${ext}`;
    await saveUploadFile(input.env, storageKey, file.content);
    const row = await insertAttachment(db, {
      orgId: input.orgId,
      storageKey,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      metadata: { source: "email" },
    });
    attachmentRows.push(row);
  }

  const parts =
    attachmentRows.length > 0
      ? buildPartsFromAttachments(attachmentRows, parsed.plainText)
      : undefined;

  const { message, serialized } = await insertMessage(db, {
    orgId: input.orgId,
    conversationId: conversation.id,
    senderType: "user",
    senderId: parsed.from.address,
    plainText: parsed.plainText,
    content: parts ? undefined : buildMessageContent(parsed.plainText),
    attachmentIds: attachmentRows.length > 0 ? attachmentRows.map((a) => a.id) : undefined,
    parts,
    isInternal: false,
    sentVia: "email",
    isAgentReply: false,
    metadata: {
      platformMessageId: parsed.messageId,
      platformMessageIds: [parsed.messageId],
    },
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
    thread: {
      channelId: conversation.channelId,
      matchReason: ensured.matchReason,
    },
  };
}

export type EnsuredEmailConversation = {
  conversation: { id: string; channelId: string; subject: string | null };
  created: boolean;
  matchReason: "in-reply-to" | "references" | "subject";
};

export async function ensureInboundEmailConversation(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    connectionId?: string;
    parsed: ParsedInboundEmailWithAttachments;
  },
): Promise<EnsuredEmailConversation> {
  const providerMessageIds = [
    input.parsed.inReplyTo,
    ...input.parsed.references.slice().reverse(),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  if (input.connectionId && providerMessageIds.length > 0) {
    const linked = await db
      .select({
        providerMessageId: channelMessageLinks.providerMessageId,
        id: conversations.id,
        channelId: conversations.channelId,
        subject: conversations.subject,
      })
      .from(channelMessageLinks)
      .innerJoin(conversations, eq(conversations.id, channelMessageLinks.conversationId))
      .where(
        and(
          eq(channelMessageLinks.connectionId, input.connectionId),
          inArray(channelMessageLinks.providerMessageId, providerMessageIds),
          eq(conversations.orgId, input.orgId),
          eq(conversations.brandId, input.brandId),
          eq(conversations.channelType, "email"),
        ),
      );
    const linksByProviderMessageId = new Map(
      linked.map((row) => [row.providerMessageId, row] as const),
    );
    const matchedProviderMessageId = providerMessageIds.find((id) =>
      linksByProviderMessageId.has(id),
    );
    const matched = matchedProviderMessageId
      ? linksByProviderMessageId.get(matchedProviderMessageId)
      : undefined;
    if (matched) {
      return {
        created: false,
        conversation: {
          id: matched.id,
          channelId: matched.channelId,
          subject: matched.subject,
        },
        matchReason:
          matchedProviderMessageId === input.parsed.inReplyTo ? "in-reply-to" : "references",
      };
    }
  }

  const existing = input.connectionId
    ? await db
        .select({
          id: conversations.id,
          channelId: conversations.channelId,
          subject: conversations.subject,
        })
        .from(channelConversationLinks)
        .innerJoin(conversations, eq(conversations.id, channelConversationLinks.conversationId))
        .where(
          and(
            eq(channelConversationLinks.connectionId, input.connectionId),
            eq(conversations.orgId, input.orgId),
            eq(conversations.brandId, input.brandId),
            eq(conversations.channelType, "email"),
          ),
        )
    : await db
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
            eq(conversations.channelType, "email"),
          ),
        );

  const thread = resolveThreadChannelId(input.parsed, existing);

  let conversation = existing.find((c) => c.channelId === thread.channelId);
  let created = false;

  if (!conversation) {
    const [row] = await db
      .insert(conversations)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        userId: input.parsed.from.address,
        channelType: "email",
        channelId: thread.channelId,
        subject: thread.subject,
        status: "open",
        lastMessageAt: new Date(),
        messageCount: 1,
        unreadCount: 1,
      })
      .returning({ id: conversations.id, channelId: conversations.channelId });

    if (!row) throw new Error("conversation_create_failed");
    conversation = { id: row.id, channelId: row.channelId, subject: thread.subject };
    created = true;

    if (input.connectionId) {
      const [insertedLink] = await db
        .insert(channelConversationLinks)
        .values({
          orgId: input.orgId,
          brandId: input.brandId,
          connectionId: input.connectionId,
          conversationId: row.id,
          externalThreadId: thread.channelId,
          metadata: { subject: input.parsed.subject },
        })
        .onConflictDoNothing({
          target: [
            channelConversationLinks.connectionId,
            channelConversationLinks.externalThreadId,
          ],
        })
        .returning({ id: channelConversationLinks.id });
      if (!insertedLink) {
        await db.delete(conversations).where(eq(conversations.id, row.id));
        const [winner] = await db
          .select({
            id: conversations.id,
            channelId: conversations.channelId,
            subject: conversations.subject,
          })
          .from(channelConversationLinks)
          .innerJoin(conversations, eq(conversations.id, channelConversationLinks.conversationId))
          .where(
            and(
              eq(channelConversationLinks.connectionId, input.connectionId),
              eq(channelConversationLinks.externalThreadId, thread.channelId),
            ),
          )
          .limit(1);
        if (!winner) throw new Error("email_conversation_link_race_failed");
        conversation = winner;
        created = false;
      }
    }

    if (created) {
      await recordConversationEvent(db, {
        orgId: input.orgId,
        conversationId: conversation.id,
        eventType: "conversation.created",
        actorType: "user",
        actorId: input.parsed.from.address,
        payload: { channel: "email" },
      });
    }
  }

  return {
    created,
    conversation,
    matchReason: thread.matchReason,
  };
}
