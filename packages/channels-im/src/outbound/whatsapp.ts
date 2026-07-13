import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, WhatsAppOutboundAction } from "../types.js";

/** Plan WhatsApp Cloud API messages using link-based media sends. */
export function planWhatsAppOutbound(input: PlanImOutboundInput): WhatsAppOutboundAction[] {
  const actions: WhatsAppOutboundAction[] = [];
  const to = input.targetId;
  const textParts = input.parts.filter(
    (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
  );
  const mediaParts = input.parts.filter((p) => p.type !== "text");
  const text =
    textParts
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n\n") || undefined;

  if (text && mediaParts.length === 0) {
    actions.push({ platform: "whatsapp", method: "messages.text", to, text });
    return actions;
  }

  const canUseCaption =
    text &&
    mediaParts.length === 1 &&
    (mediaParts[0]?.type === "image" ||
      mediaParts[0]?.type === "video" ||
      mediaParts[0]?.type === "file");
  if (text && !canUseCaption) {
    actions.push({ platform: "whatsapp", method: "messages.text", to, text });
  }

  for (const part of mediaParts) {
    const att = input.attachments.get(part.attachmentId);
    if (!att) continue;
    const caption = canUseCaption ? text : undefined;
    if (part.type === "image") {
      actions.push({
        platform: "whatsapp",
        method: "messages.image",
        to,
        imageUrl: att.contentUrl,
        caption: caption ?? part.alt,
      });
    } else if (part.type === "audio") {
      actions.push({
        platform: "whatsapp",
        method: "messages.audio",
        to,
        audioUrl: att.contentUrl,
      });
    } else if (part.type === "video") {
      actions.push({
        platform: "whatsapp",
        method: "messages.video",
        to,
        videoUrl: att.contentUrl,
        caption,
      });
    } else if (part.type === "file") {
      actions.push({
        platform: "whatsapp",
        method: "messages.document",
        to,
        documentUrl: att.contentUrl,
        fileName: part.fileName ?? att.fileName,
        caption,
      });
    }
  }

  return actions;
}
