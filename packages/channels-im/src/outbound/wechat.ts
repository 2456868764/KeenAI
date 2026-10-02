import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, WeChatOutboundAction } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const WECHAT_LIMITS = getImOutboundLimits("wechat");

export function planWeChatOutbound(input: PlanImOutboundInput): WeChatOutboundAction[] {
  const text = input.parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const actions: WeChatOutboundAction[] = [];
  if (text || input.directives?.interaction?.buttons?.length) {
    const buttons = input.directives?.interaction?.buttons;
    const chunks = splitOutboundText(
      text || " ",
      buttons?.length
        ? (WECHAT_LIMITS.maxInteractiveTextCharacters ?? 1024)
        : (WECHAT_LIMITS.maxTextCharacters ?? 2048),
    );
    for (const [index, chunk] of chunks.entries()) {
      actions.push({
        platform: "wechat",
        method: "message.send",
        toUser: input.targetId,
        text: chunk,
        buttons: index === chunks.length - 1 ? buttons : undefined,
      });
    }
  }
  for (const part of input.parts) {
    if (part.type === "text") continue;
    const attachment = input.attachments.get(part.attachmentId);
    if (!attachment) continue;
    if (part.type === "file") {
      for (const chunk of splitOutboundText(
        `${part.fileName}: ${attachment.contentUrl}`,
        WECHAT_LIMITS.maxTextCharacters ?? 2048,
      )) {
        actions.push({
          platform: "wechat",
          method: "message.send",
          toUser: input.targetId,
          text: chunk,
        });
      }
      continue;
    }
    actions.push({
      platform: "wechat",
      method: "media.uploadAndSend",
      toUser: input.targetId,
      mediaType: part.type === "image" ? "image" : part.type === "audio" ? "voice" : "video",
      fileUrl: attachment.contentUrl,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
    });
  }
  return actions;
}
