import { planDiscordOutbound } from "./outbound/discord.js";
import { planSlackOutbound } from "./outbound/slack.js";
import { planTelegramOutbound } from "./outbound/telegram.js";
import type { ImOutboundAction, PlanImOutboundInput } from "./types.js";

export function planImOutbound(input: PlanImOutboundInput): ImOutboundAction[] {
  if (input.platform === "telegram") return planTelegramOutbound(input);
  if (input.platform === "discord") return planDiscordOutbound(input);
  return planSlackOutbound(input);
}

export { adaptDiscordEvent, type DiscordGatewayPayload } from "./inbound/discord.js";
export { adaptSlackEvent, slackUrlVerificationChallenge } from "./inbound/slack.js";
export { adaptTelegramUpdate, type TelegramUpdate } from "./inbound/telegram.js";
export { defaultFileName, extensionForMime, isAllowedImMime } from "./mime.js";
export { planDiscordOutbound } from "./outbound/discord.js";
export { planSlackOutbound } from "./outbound/slack.js";
export { planTelegramOutbound } from "./outbound/telegram.js";
export type {
  ImAttachmentRef,
  ImOutboundAction,
  ImPendingAttachment,
  ImPlatform,
  ParsedInboundImMessage,
  PlanImOutboundInput,
  SlackOutboundAction,
  TelegramOutboundAction,
} from "./types.js";
