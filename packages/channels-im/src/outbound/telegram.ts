import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, TelegramOutboundAction } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const TELEGRAM_LIMITS = getImOutboundLimits("telegram");

/** Plan Telegram Bot API calls for multimodal outbound (Hermes send order). */
export function planTelegramOutbound(input: PlanImOutboundInput): TelegramOutboundAction[] {
  const actions: TelegramOutboundAction[] = [];
  const chatId = input.targetId;
  const messageThreadId = positiveInteger(input.channelAttributes?.providerThreadId);
  const businessConnectionId = optionalString(input.channelAttributes?.businessConnectionId);
  const textParts = input.parts.filter(
    (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
  );
  const mediaParts = input.parts.filter((p) => p.type !== "text");
  const text =
    textParts
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n\n") || undefined;

  const voiceParts = mediaParts.filter((p) => p.type === "audio");
  const imageParts = mediaParts.filter((p) => p.type === "image");
  const videoParts = mediaParts.filter((p) => p.type === "video");
  const fileParts = mediaParts.filter((p) => p.type === "file");

  const sendVoice = input.directives?.asVoice !== false;
  const buttons = input.directives?.interaction?.buttons;
  const resolvedMediaCount = mediaParts.filter((part) =>
    input.attachments.has(part.attachmentId),
  ).length;
  const caption =
    !buttons?.length &&
    resolvedMediaCount === 1 &&
    Array.from(text ?? "").length <= (TELEGRAM_LIMITS.maxCaptionCharacters ?? 0)
      ? text
      : undefined;
  if (text && !caption) {
    const chunks = splitOutboundText(text, TELEGRAM_LIMITS.maxTextCharacters ?? 4096);
    for (const [index, chunk] of chunks.entries()) {
      actions.push({
        platform: "telegram",
        method: "sendMessage",
        chatId,
        text: chunk,
        messageThreadId,
        businessConnectionId,
        buttons: index === chunks.length - 1 ? buttons : undefined,
      });
    }
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
        caption: caption ?? shortCaption(part.alt),
        fileName: att.fileName,
        messageThreadId,
        businessConnectionId,
      });
    } else {
      actions.push({
        platform: "telegram",
        method: "sendPhoto",
        chatId,
        photoUrl: att.contentUrl,
        caption: caption ?? shortCaption(part.alt),
        messageThreadId,
        businessConnectionId,
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
      caption,
      messageThreadId,
      businessConnectionId,
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
      caption,
      fileName: part.fileName ?? att.fileName,
      messageThreadId,
      businessConnectionId,
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
        caption,
        fileName: att.fileName,
        messageThreadId,
        businessConnectionId,
      });
    }
  } else {
    for (const part of voiceParts) {
      const att = input.attachments.get(part.attachmentId);
      if (!att) continue;
      actions.push({
        platform: "telegram",
        method: "sendVoice",
        chatId,
        voiceUrl: att.contentUrl,
        caption,
        messageThreadId,
        businessConnectionId,
      });
    }
  }

  if (actions[0] && input.replyToMessageId) {
    actions[0].replyToMessageId = input.replyToMessageId;
  }
  return actions;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function shortCaption(value: string | undefined): string | undefined {
  if (!value || Array.from(value).length > (TELEGRAM_LIMITS.maxCaptionCharacters ?? 0)) {
    return undefined;
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
