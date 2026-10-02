import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, WhatsAppOutboundAction } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const WHATSAPP_LIMITS = getImOutboundLimits("whatsapp");

/** Plan WhatsApp Cloud API messages using link-based media sends. */
export function planWhatsAppOutbound(input: PlanImOutboundInput): WhatsAppOutboundAction[] {
  const actions: WhatsAppOutboundAction[] = [];
  const to = input.targetId;
  const template = input.directives?.whatsappTemplate;
  if (template) {
    actions.push({
      platform: "whatsapp",
      method: "messages.template",
      to,
      templateName: template.name,
      languageCode: template.languageCode,
      components: template.components,
      replyToMessageId: input.replyToMessageId,
    });
    return actions;
  }
  const textParts = input.parts.filter(
    (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
  );
  const mediaParts = input.parts.filter((p) => p.type !== "text");
  const text =
    textParts
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n\n") || undefined;

  const buttons = input.directives?.interaction?.buttons;
  const captionPart = mediaParts.length === 1 ? mediaParts[0] : undefined;
  const canUseCaption = Boolean(
    text &&
      !buttons?.length &&
      captionPart &&
      input.attachments.has(captionPart.attachmentId) &&
      Array.from(text).length <= (WHATSAPP_LIMITS.maxCaptionCharacters ?? 0) &&
      (captionPart.type === "image" || captionPart.type === "video" || captionPart.type === "file"),
  );
  if (text && !canUseCaption) {
    const chunks = splitOutboundText(
      text,
      buttons?.length
        ? (WHATSAPP_LIMITS.maxInteractiveTextCharacters ?? 1024)
        : (WHATSAPP_LIMITS.maxTextCharacters ?? 4096),
    );
    for (const [index, chunk] of chunks.entries()) {
      actions.push({
        platform: "whatsapp",
        method: "messages.text",
        to,
        text: chunk,
        buttons: index === chunks.length - 1 ? buttons : undefined,
      });
    }
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
        caption: caption ?? shortCaption(part.alt),
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

  if (actions[0] && input.replyToMessageId) {
    actions[0].replyToMessageId = input.replyToMessageId;
  }
  return actions;
}

function shortCaption(value: string | undefined): string | undefined {
  if (!value || Array.from(value).length > (WHATSAPP_LIMITS.maxCaptionCharacters ?? 0)) {
    return undefined;
  }
  return value;
}
