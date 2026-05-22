import { parseAgentResponse } from "@keenai/channels-core";
import {
  type ImAttachmentRef,
  type ImOutboundAction,
  type ImPlatform,
  planImOutbound,
} from "@keenai/channels-im";
import type { MessagePart, OutboundDirectives } from "@keenai/shared";
import { attachments, conversations, messages } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import {
  attachmentContentPath,
  extractPartsFromContent,
  loadAttachmentsForMessages,
} from "./attachments.js";

type Db = AppVariables["store"]["db"];

export async function planConversationImOutbound(
  db: Db,
  input: {
    orgId: string;
    conversationId: string;
    messageId: string;
    apiBaseUrl: string;
    agentOutboundText?: string;
    directives?: OutboundDirectives;
  },
): Promise<{ platform: ImPlatform; targetId: string; actions: ImOutboundAction[] } | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);

  if (!conversation) throw new Error("conversation not found");
  if (conversation.channelType !== "telegram" && conversation.channelType !== "slack") {
    return null;
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, conversation.id)))
    .limit(1);

  if (!message) throw new Error("message not found");

  let parts = extractPartsFromContent(message.content) ?? [];
  let directives = input.directives;

  if (input.agentOutboundText?.trim()) {
    const parsed = parseAgentResponse(input.agentOutboundText);
    directives = { ...directives, ...parsed.directives };
    if (parsed.parts.length > 0) {
      const outboundParts: MessagePart[] = [];
      for (const part of parsed.parts) {
        if (part.type === "text") {
          outboundParts.push({ type: "text", text: part.text });
        } else if (part.type === "attachment") {
          outboundParts.push({ type: "image", attachmentId: part.attachmentId });
        }
      }
      parts = outboundParts;
    }
  }

  if (parts.length === 0 && message.plainText) {
    parts = [{ type: "text", text: message.plainText }];
  }

  const attachmentMap = await loadAttachmentsForMessages(db, [message.id]);
  const rows = attachmentMap.get(message.id) ?? [];
  const attachmentIds = collectAttachmentIds(
    parts,
    rows.map((r) => r.id),
  );

  const refs = new Map<string, ImAttachmentRef>();
  for (const row of rows) {
    if (!attachmentIds.includes(row.id)) continue;
    refs.set(row.id, {
      attachmentId: row.id,
      contentUrl: `${input.apiBaseUrl}${attachmentContentPath(row.id)}`,
      contentType: row.contentType ?? "application/octet-stream",
      fileName: row.fileName ?? "attachment",
    });
  }

  const actions = planImOutbound({
    platform: conversation.channelType,
    targetId: conversation.channelId,
    parts: normalizeParts(parts, rows),
    attachments: refs,
    directives,
  });

  return {
    platform: conversation.channelType,
    targetId: conversation.channelId,
    actions,
  };
}

function collectAttachmentIds(parts: MessagePart[], linkedIds: string[]): string[] {
  const fromParts = parts
    .filter(
      (p): p is Extract<MessagePart, { type: "image" | "audio" | "video" | "file" }> =>
        p.type !== "text",
    )
    .map((p) => p.attachmentId);
  return [...new Set([...fromParts, ...linkedIds])];
}

function normalizeParts(
  parts: MessagePart[],
  attachmentRows: { id: string; contentType: string | null; fileName: string | null }[],
): MessagePart[] {
  if (parts.some((p) => p.type !== "text")) return parts;
  if (attachmentRows.length === 0) return parts;

  const normalized: MessagePart[] = [...parts.filter((p) => p.type === "text")];
  for (const row of attachmentRows) {
    const mime = row.contentType?.toLowerCase() ?? "";
    if (mime.startsWith("image/")) {
      normalized.push({ type: "image", attachmentId: row.id });
    } else if (mime.startsWith("audio/")) {
      normalized.push({ type: "audio", attachmentId: row.id });
    } else if (mime.startsWith("video/")) {
      normalized.push({ type: "video", attachmentId: row.id });
    } else {
      normalized.push({
        type: "file",
        attachmentId: row.id,
        fileName: row.fileName ?? "attachment",
      });
    }
  }
  return normalized;
}
