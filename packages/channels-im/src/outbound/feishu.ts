import type { MessagePart } from "@keenai/shared";
import type { FeishuOutboundAction, PlanImOutboundInput } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const FEISHU_LIMITS = getImOutboundLimits("feishu");

export function planFeishuOutbound(input: PlanImOutboundInput): FeishuOutboundAction[] {
  const text = input.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const actions: FeishuOutboundAction[] = [];
  const textChunks = splitOutboundText(text, FEISHU_LIMITS.maxTextCharacters ?? 4000);
  const buttons = input.directives?.interaction?.buttons;
  for (const [index, chunk] of textChunks.entries()) {
    actions.push({
      platform: "feishu",
      method: "im.message.create",
      receiveId: input.targetId,
      receiveIdType: "chat_id",
      text: chunk,
      replyToMessageId: index === 0 ? input.replyToMessageId : undefined,
      buttons: index === textChunks.length - 1 ? buttons : undefined,
    });
  }
  for (const part of input.parts) {
    if (part.type === "text") continue;
    const attachment = input.attachments.get(part.attachmentId);
    if (!attachment) continue;
    actions.push({
      platform: "feishu",
      method: "im.media.uploadAndSend",
      receiveId: input.targetId,
      receiveIdType: "chat_id",
      mediaType: part.type === "image" ? "image" : "file",
      fileUrl: attachment.contentUrl,
      fileName: part.type === "file" ? part.fileName : attachment.fileName,
      contentType: attachment.contentType,
      replyToMessageId: input.replyToMessageId,
    });
  }
  return actions;
}
