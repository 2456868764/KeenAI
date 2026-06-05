import type { MessagePart } from "@keenai/shared";
import type { DiscordOutboundAction, PlanImOutboundInput } from "../types.js";

export function planDiscordOutbound(input: PlanImOutboundInput): DiscordOutboundAction[] {
  const text = input.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!text) return [];
  return [
    {
      platform: "discord",
      method: "createMessage",
      channelId: input.targetId,
      content: text.slice(0, 2000),
    },
  ];
}
