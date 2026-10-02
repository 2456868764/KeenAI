import type { MessagePart } from "@keenai/shared";
import type { DiscordOutboundAction, PlanImOutboundInput } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const DISCORD_LIMITS = getImOutboundLimits("discord");

export function planDiscordOutbound(input: PlanImOutboundInput): DiscordOutboundAction[] {
  const text = input.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const actions: DiscordOutboundAction[] = [];
  const buttons = input.directives?.interaction?.buttons;
  const textChunks = splitOutboundText(text, DISCORD_LIMITS.maxTextCharacters ?? 2000);
  const mediaParts = input.parts.filter((part) => part.type !== "text");
  const attachSingleTextChunk =
    !buttons?.length && textChunks.length === 1 && mediaParts.length > 0;
  if (!attachSingleTextChunk) {
    for (const [index, chunk] of textChunks.entries()) {
      actions.push({
        platform: "discord",
        method: "createMessage",
        channelId: input.targetId,
        content: chunk,
        replyToMessageId: index === 0 ? input.replyToMessageId : undefined,
        buttons: index === textChunks.length - 1 ? buttons : undefined,
      });
    }
  }
  let attachedText = false;
  for (const part of mediaParts) {
    const attachment = input.attachments.get(part.attachmentId);
    if (!attachment) continue;
    actions.push({
      platform: "discord",
      method: "createMessageWithFile",
      channelId: input.targetId,
      content: attachSingleTextChunk && !attachedText ? textChunks[0] : undefined,
      fileUrl: attachment.contentUrl,
      fileName: part.type === "file" ? part.fileName : attachment.fileName,
      contentType: attachment.contentType,
      description: part.type === "image" ? part.alt : undefined,
      replyToMessageId: actions.length === 0 ? input.replyToMessageId : undefined,
    });
    attachedText = true;
  }
  return actions;
}
