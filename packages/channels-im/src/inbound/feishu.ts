import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ParsedInboundImMessage } from "../types.js";

type FeishuHeader = {
  event_type?: string;
  event_id?: string;
};

type FeishuMessage = {
  message_id?: string;
  chat_id?: string;
  message_type?: string;
  content?: string;
};

type FeishuEvent = {
  sender?: { sender_id?: { open_id?: string; user_id?: string } };
  message?: FeishuMessage;
};

export type FeishuEventPayload = {
  schema?: string;
  type?: string;
  challenge?: string;
  header?: FeishuHeader;
  event?: FeishuEvent;
};

export function feishuUrlVerificationChallenge(payload: FeishuEventPayload): string | null {
  if (payload.type === "url_verification" && payload.challenge) return payload.challenge;
  if (payload.header?.event_type === "url_verification" && payload.challenge) {
    return payload.challenge;
  }
  return null;
}

/** Normalize a Feishu/Lark event callback into a KeenAI inbound IM message. */
export function adaptFeishuEvent(payload: FeishuEventPayload): ParsedInboundImMessage | null {
  const eventType = payload.header?.event_type ?? payload.type;
  if (eventType !== "im.message.receive_v1") return null;

  const message = payload.event?.message;
  if (!message?.message_id || !message.chat_id) return null;
  if (message.message_type !== "text" || !message.content) return null;

  let text = "";
  try {
    const parsed = JSON.parse(message.content) as { text?: string };
    text = parsed.text?.trim() ?? "";
  } catch {
    text = message.content.trim();
  }
  if (!text) return null;

  const senderId =
    payload.event?.sender?.sender_id?.open_id ??
    payload.event?.sender?.sender_id?.user_id ??
    "feishu-user";

  const parts: MessagePart[] = [{ type: "text", text }];

  return {
    platformMessageId: message.message_id,
    channelType: "feishu",
    channelId: message.chat_id,
    userId: senderId,
    plainText: text,
    parts,
    messageKind: inferMessageKind(parts),
    attachments: [],
  };
}
