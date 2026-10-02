import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, WeComOutboundAction } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const WECOM_LIMITS = getImOutboundLimits("wecom");

export function planWeComOutbound(input: PlanImOutboundInput): WeComOutboundAction[] {
  const text = input.parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const rawAgentId = input.channelAttributes?.wecomAgentId;
  const agentId = typeof rawAgentId === "number" ? rawAgentId : Number(rawAgentId);
  if (!Number.isInteger(agentId) || agentId <= 0) return [];

  const actions: WeComOutboundAction[] = [];
  if (text) {
    const buttons = input.directives?.interaction?.buttons;
    const chunks = splitOutboundText(
      text,
      buttons?.length
        ? (WECOM_LIMITS.maxInteractiveTextCharacters ?? 128)
        : (WECOM_LIMITS.maxTextCharacters ?? 2048),
    );
    for (const [index, chunk] of chunks.entries()) {
      if (index === chunks.length - 1 && buttons?.length) {
        for (let buttonIndex = 0; buttonIndex < buttons.length; buttonIndex += 6) {
          actions.push({
            platform: "wecom",
            method: "message.send",
            toUser: input.targetId,
            agentId,
            text: buttonIndex === 0 ? chunk : "More options",
            buttons: buttons.slice(buttonIndex, buttonIndex + 6),
          });
        }
      } else {
        actions.push({
          platform: "wecom",
          method: "message.send",
          toUser: input.targetId,
          agentId,
          text: chunk,
        });
      }
    }
  }
  for (const part of input.parts) {
    if (part.type === "text") continue;
    const attachment = input.attachments.get(part.attachmentId);
    if (!attachment) continue;
    actions.push({
      platform: "wecom",
      method: "media.uploadAndSend",
      toUser: input.targetId,
      agentId,
      mediaType:
        part.type === "image"
          ? "image"
          : part.type === "audio"
            ? "voice"
            : part.type === "video"
              ? "video"
              : "file",
      fileUrl: attachment.contentUrl,
      fileName: part.type === "file" ? part.fileName : attachment.fileName,
      contentType: attachment.contentType,
    });
  }
  return actions;
}
