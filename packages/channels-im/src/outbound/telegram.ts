import type { MessagePart } from "@keenai/shared";
import type { ImAttachmentRef, PlanImOutboundInput, TelegramOutboundAction } from "../types.js";

/** Plan Telegram Bot API calls for multimodal outbound (Hermes send order). */
export function planTelegramOutbound(input: PlanImOutboundInput): TelegramOutboundAction[] {
  const actions: TelegramOutboundAction[] = [];
  const chatId = input.targetId;
  const textParts = input.parts.filter(
    (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
  );
  const mediaParts = input.parts.filter((p) => p.type !== "text");
  const caption =
    textParts
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n\n") || undefined;

  const voiceParts = mediaParts.filter((p) => p.type === "audio");
  const imageParts = mediaParts.filter((p) => p.type === "image");
  const videoParts = mediaParts.filter((p) => p.type === "video");
  const fileParts = mediaParts.filter((p) => p.type === "file");

  const sendVoice = input.directives?.asVoice !== false;

  if (sendVoice) {
    for (const part of voiceParts) {
      const att = input.attachments.get(part.attachmentId);
      if (!att) continue;
      actions.push({
        platform: "telegram",
        method: "sendVoice",
        chatId,
        voiceUrl: att.contentUrl,
        caption: voiceParts.length === 1 ? caption : undefined,
      });
    }
  }

  const textOnly =
    caption &&
    imageParts.length === 0 &&
    videoParts.length === 0 &&
    fileParts.length === 0 &&
    (!sendVoice || voiceParts.length === 0);
  if (textOnly) {
    actions.push({ platform: "telegram", method: "sendMessage", chatId, text: caption });
  } else if (
    caption &&
    imageParts.length === 0 &&
    videoParts.length === 0 &&
    fileParts.length === 0
  ) {
    actions.push({ platform: "telegram", method: "sendMessage", chatId, text: caption });
  }

  for (const part of imageParts) {
    const att = input.attachments.get(part.attachmentId);
    if (!att) continue;
    const asDocument = input.directives?.asDocument === true;
    if (asDocument) {
      actions.push({
        platform: "telegram",
        method: "sendDocument",
        chatId,
        documentUrl: att.contentUrl,
        caption: imageParts.length === 1 ? caption : part.alt,
        fileName: att.fileName,
      });
    } else {
      actions.push({
        platform: "telegram",
        method: "sendPhoto",
        chatId,
        photoUrl: att.contentUrl,
        caption: imageParts.length === 1 ? caption : part.alt,
      });
    }
  }

  for (const part of videoParts) {
    const att = input.attachments.get(part.attachmentId);
    if (!att) continue;
    actions.push({
      platform: "telegram",
      method: "sendVideo",
      chatId,
      videoUrl: att.contentUrl,
      caption: videoParts.length === 1 ? caption : undefined,
    });
  }

  for (const part of fileParts) {
    const att = input.attachments.get(part.attachmentId);
    if (!att) continue;
    actions.push({
      platform: "telegram",
      method: "sendDocument",
      chatId,
      documentUrl: att.contentUrl,
      caption: fileParts.length === 1 ? caption : undefined,
      fileName: part.fileName ?? att.fileName,
    });
  }

  if (!sendVoice) {
    for (const part of voiceParts) {
      const att = input.attachments.get(part.attachmentId);
      if (!att) continue;
      actions.push({
        platform: "telegram",
        method: "sendDocument",
        chatId,
        documentUrl: att.contentUrl,
        fileName: att.fileName,
      });
    }
  }

  return actions;
}
