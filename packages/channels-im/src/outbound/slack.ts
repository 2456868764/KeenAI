import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, SlackOutboundAction } from "../types.js";

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

  if (text && mediaParts.length === 0) {
    actions.push({ platform: "slack", method: "chat.postMessage", channel, text });
    return actions;
  }

  if (text) {
    actions.push({ platform: "slack", method: "chat.postMessage", channel, text });
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
      method: "files.upload",
      channel,
      fileUrl: att.contentUrl,
      fileName: part.type === "file" ? part.fileName : att.fileName,
      title: part.type === "image" ? part.alt : undefined,
    });
  }

  return actions;
}
