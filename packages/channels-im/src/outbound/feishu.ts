import type { MessagePart } from "@keenai/shared";
import type { FeishuOutboundAction, PlanImOutboundInput } from "../types.js";

export function planFeishuOutbound(input: PlanImOutboundInput): FeishuOutboundAction[] {
  const text = input.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!text) return [];
  return [
    {
      platform: "feishu",
      method: "im.message.create",
      receiveId: input.targetId,
      receiveIdType: "chat_id",
      text: text.slice(0, 4000),
    },
  ];
}
