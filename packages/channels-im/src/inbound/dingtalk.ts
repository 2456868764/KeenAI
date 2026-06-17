import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ParsedInboundImMessage } from "../types.js";

export type DingTalkRobotPayload = {
  msgtype?: string;
  text?: { content?: string };
  msgId?: string;
  createAt?: number;
  conversationId?: string;
  conversationType?: string;
  conversationTitle?: string;
  senderId?: string;
  senderNick?: string;
  sessionWebhook?: string;
};

/** Normalize a DingTalk custom robot callback into a KeenAI inbound IM message. */
export function adaptDingTalkRobot(payload: DingTalkRobotPayload): ParsedInboundImMessage | null {
  if (payload.msgtype !== "text") return null;
  const text = payload.text?.content?.trim();
  if (!text || !payload.conversationId) return null;

  const parts: MessagePart[] = [{ type: "text", text }];
  const conversationAttributes: Record<string, unknown> = {};
  if (payload.sessionWebhook) {
    conversationAttributes.sessionWebhook = payload.sessionWebhook;
  }
  if (payload.conversationTitle) {
    conversationAttributes.conversationTitle = payload.conversationTitle;
  }

  return {
    platformMessageId:
      payload.msgId ?? `${payload.conversationId}-${payload.createAt ?? Date.now()}`,
    channelType: "dingtalk",
    channelId: payload.conversationId,
    userId: payload.senderId ?? payload.senderNick ?? "dingtalk-user",
    plainText: text,
    parts,
    messageKind: inferMessageKind(parts),
    attachments: [],
    conversationAttributes:
      Object.keys(conversationAttributes).length > 0 ? conversationAttributes : undefined,
  };
}
