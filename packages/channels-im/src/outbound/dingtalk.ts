import type { MessagePart } from "@keenai/shared";
import type { DingTalkOutboundAction, PlanImOutboundInput } from "../types.js";
import { getImOutboundLimits } from "./limits.js";
import { splitOutboundText } from "./text.js";

const DINGTALK_LIMITS = getImOutboundLimits("dingtalk");

export function planDingTalkOutbound(input: PlanImOutboundInput): DingTalkOutboundAction[] {
  const destination = dingtalkDestination(input);
  if (!destination) return [];

  const text = input.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const mediaLines: string[] = [];
  for (const part of input.parts) {
    if (part.type === "text") continue;
    const attachment = input.attachments.get(part.attachmentId);
    if (!attachment) continue;
    const label = part.type === "file" ? part.fileName : attachment.fileName;
    mediaLines.push(
      part.type === "image"
        ? `![${part.alt ?? label}](${attachment.contentUrl})`
        : `[${label}](${attachment.contentUrl})`,
    );
  }
  if (!text && mediaLines.length === 0) return [];
  const buttons = input.directives?.interaction?.buttons;
  const combinedText = [text, ...mediaLines].filter(Boolean).join("\n\n");
  const chunks = splitOutboundText(combinedText, DINGTALK_LIMITS.maxTextCharacters ?? 4000);
  if (buttons?.length) {
    if (buttons.some((button) => !button.url && !button.callbackUrl)) {
      throw new Error("dingtalk_button_url_required");
    }
    const title = text.split("\n", 1)[0]?.slice(0, 64) || "KeenAI";
    const actions = chunks
      .slice(0, -1)
      .map((chunk) => dingtalkMessageAction(destination, "sampleMarkdown", { title, text: chunk }));
    const prompt = chunks.at(-1) ?? combinedText;
    for (let index = 0; index < buttons.length; index += 5) {
      const actionButtons = buttons.slice(index, index + 5);
      actions.push(
        destination.kind === "sessionWebhook"
          ? {
              platform: "dingtalk",
              method: "sessionWebhook.actionCard",
              sessionWebhook: destination.sessionWebhook,
              title,
              text: index === 0 ? prompt : "More options",
              buttons: actionButtons,
            }
          : dingtalkMessageAction(destination, "sampleActionCard", {
              title,
              text: index === 0 ? prompt : "More options",
              btnOrientation: "0",
              btns: actionButtons.map((button) => ({
                title: button.label,
                actionURL: button.url ?? button.callbackUrl,
              })),
            }),
      );
    }
    return actions;
  }
  if (mediaLines.length > 0) {
    const title = text.split("\n", 1)[0]?.slice(0, 64) || "KeenAI attachment";
    return chunks.map((chunk) =>
      dingtalkMessageAction(destination, "sampleMarkdown", { title, text: chunk }),
    );
  }
  return chunks.map((chunk) =>
    dingtalkMessageAction(destination, "sampleText", { content: chunk }),
  );
}

type DingTalkDestination =
  | { kind: "group"; robotCode: string; openConversationId: string }
  | { kind: "direct"; robotCode: string; userIds: string[] }
  | { kind: "sessionWebhook"; sessionWebhook: string };

function dingtalkDestination(input: PlanImOutboundInput): DingTalkDestination | null {
  const robotCode = stringAttribute(input, "robotCode");
  const conversationType = stringAttribute(input, "conversationType");
  if (robotCode && conversationType === "2") {
    return { kind: "group", robotCode, openConversationId: input.targetId };
  }
  const senderStaffId = stringAttribute(input, "senderStaffId");
  if (robotCode && conversationType === "1" && senderStaffId) {
    return { kind: "direct", robotCode, userIds: [senderStaffId] };
  }
  const sessionWebhook = stringAttribute(input, "sessionWebhook");
  if (!sessionWebhook || sessionWebhookExpired(input)) return null;
  return { kind: "sessionWebhook", sessionWebhook };
}

function dingtalkMessageAction(
  destination: DingTalkDestination,
  msgKey: "sampleText" | "sampleMarkdown" | "sampleActionCard",
  message: Record<string, unknown>,
): DingTalkOutboundAction {
  if (destination.kind === "sessionWebhook") {
    if (msgKey === "sampleText") {
      return {
        platform: "dingtalk",
        method: "sessionWebhook.send",
        sessionWebhook: destination.sessionWebhook,
        text: String(message.content ?? ""),
      };
    }
    return {
      platform: "dingtalk",
      method: "sessionWebhook.markdown",
      sessionWebhook: destination.sessionWebhook,
      title: String(message.title ?? "KeenAI"),
      text: String(message.text ?? ""),
    };
  }
  const common = {
    platform: "dingtalk" as const,
    robotCode: destination.robotCode,
    msgKey,
    msgParam: JSON.stringify(message),
  };
  return destination.kind === "group"
    ? {
        ...common,
        method: "robot.groupMessages.send",
        openConversationId: destination.openConversationId,
      }
    : {
        ...common,
        method: "robot.oToMessages.batchSend",
        userIds: destination.userIds,
      };
}

function stringAttribute(input: PlanImOutboundInput, key: string): string | undefined {
  const value = input.channelAttributes?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sessionWebhookExpired(input: PlanImOutboundInput): boolean {
  const value = input.channelAttributes?.sessionWebhookExpiredTime;
  const expiresAt =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now();
}
