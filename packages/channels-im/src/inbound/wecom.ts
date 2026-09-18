import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ParsedInboundImMessage } from "../types.js";

export type WeComMessagePayload = {
  MsgId?: string | number;
  msgid?: string | number;
  MsgType?: string;
  msgtype?: string;
  Content?: string;
  content?: string;
  FromUserName?: string;
  fromuserid?: string;
  ChatId?: string;
  chatid?: string;
  AgentID?: string | number;
  agentid?: string | number;
  CreateTime?: string | number;
  createtime?: string | number;
};

/** Normalize a decrypted WeCom application callback into a KeenAI inbound message. */
export function adaptWeComMessage(payload: WeComMessagePayload): ParsedInboundImMessage | null {
  const messageType = payload.MsgType ?? payload.msgtype;
  if (messageType !== "text") return null;
  const text = (payload.Content ?? payload.content)?.trim();
  const userId = payload.FromUserName ?? payload.fromuserid;
  if (!text || !userId) return null;

  const chatId = payload.ChatId ?? payload.chatid ?? userId;
  const messageId =
    payload.MsgId ??
    payload.msgid ??
    `${chatId}-${payload.CreateTime ?? payload.createtime ?? Date.now()}`;
  const parts: MessagePart[] = [{ type: "text", text }];
  const agentId = payload.AgentID ?? payload.agentid;

  return {
    platformMessageId: String(messageId),
    channelType: "wecom",
    channelId: chatId,
    userId,
    plainText: text,
    parts,
    messageKind: inferMessageKind(parts),
    attachments: [],
    conversationAttributes: agentId === undefined ? undefined : { wecomAgentId: agentId },
  };
}
