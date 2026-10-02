import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, SlackOutboundAction } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const SLACK_LIMITS = getImOutboundLimits("slack");

/** Plan Slack Web API calls for multimodal outbound. */
export function planSlackOutbound(input: PlanImOutboundInput): SlackOutboundAction[] {
  const actions: SlackOutboundAction[] = [];
  const channel = input.targetId;
  const textParts = input.parts.filter(
    (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
  );
  const mediaParts = input.parts.filter((p) => p.type !== "text");
  const text = textParts
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const buttons = input.directives?.interaction?.buttons;
  const textChunks = splitOutboundText(
    text,
    buttons?.length
      ? (SLACK_LIMITS.maxInteractiveTextCharacters ?? 3000)
      : (SLACK_LIMITS.maxTextCharacters ?? 4000),
  );
  for (const [index, chunk] of textChunks.entries()) {
    actions.push({
      platform: "slack",
      method: "chat.postMessage",
      channel,
      text: chunk,
      threadTs: input.replyToMessageId,
      buttons: index === textChunks.length - 1 ? buttons : undefined,
    });
  }

  for (const part of mediaParts) {
    const att = input.attachments.get(
      part.type === "file" ||
        part.type === "image" ||
        part.type === "audio" ||
        part.type === "video"
        ? part.attachmentId
        : "",
    );
    if (!att) continue;
    actions.push({
      platform: "slack",
      method: "files.uploadV2",
      channel,
      fileUrl: att.contentUrl,
      fileName: part.type === "file" ? part.fileName : att.fileName,
      contentType: att.contentType,
      title: part.type === "image" ? part.alt : undefined,
      threadTs: input.replyToMessageId,
    });
  }

  return actions;
}
