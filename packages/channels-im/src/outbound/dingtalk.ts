import type { MessagePart } from "@keenai/shared";
import type { DingTalkOutboundAction, PlanImOutboundInput } from "../types.js";

export function planDingTalkOutbound(input: PlanImOutboundInput): DingTalkOutboundAction[] {
  const sessionWebhook = input.channelAttributes?.sessionWebhook;
  if (typeof sessionWebhook !== "string" || !sessionWebhook.trim()) return [];

  const text = input.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!text) return [];
  return [
    {
      platform: "dingtalk",
      method: "sessionWebhook.send",
      sessionWebhook,
      text: text.slice(0, 4000),
    },
  ];
}
