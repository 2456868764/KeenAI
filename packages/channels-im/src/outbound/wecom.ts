import type { MessagePart } from "@keenai/shared";
import type { PlanImOutboundInput, WeComOutboundAction } from "../types.js";

export function planWeComOutbound(input: PlanImOutboundInput): WeComOutboundAction[] {
  const text = input.parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const rawAgentId = input.channelAttributes?.wecomAgentId;
  const agentId = typeof rawAgentId === "number" ? rawAgentId : Number(rawAgentId);
  if (!text || !Number.isInteger(agentId) || agentId <= 0) return [];

  return [
    {
      platform: "wecom",
      method: "message.send",
      toUser: input.targetId,
      agentId,
      text: text.slice(0, 2048),
    },
  ];
}
