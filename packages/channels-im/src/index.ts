import { planDingTalkOutbound } from "./outbound/dingtalk.js";
import { planDiscordOutbound } from "./outbound/discord.js";
import { planFeishuOutbound } from "./outbound/feishu.js";
import { planSlackOutbound } from "./outbound/slack.js";
import { planTelegramOutbound } from "./outbound/telegram.js";
import type { ImOutboundAction, PlanImOutboundInput } from "./types.js";

export function planImOutbound(input: PlanImOutboundInput): ImOutboundAction[] {
  if (input.platform === "telegram") return planTelegramOutbound(input);
  if (input.platform === "discord") return planDiscordOutbound(input);
  if (input.platform === "feishu") return planFeishuOutbound(input);
  if (input.platform === "dingtalk") return planDingTalkOutbound(input);
  return planSlackOutbound(input);
}

export { adaptDingTalkRobot, type DingTalkRobotPayload } from "./inbound/dingtalk.js";
export { adaptDiscordEvent, type DiscordGatewayPayload } from "./inbound/discord.js";
export {
  adaptFeishuEvent,
  feishuUrlVerificationChallenge,
  type FeishuEventPayload,
} from "./inbound/feishu.js";
export { adaptSlackEvent, slackUrlVerificationChallenge } from "./inbound/slack.js";
export { adaptTelegramUpdate, type TelegramUpdate } from "./inbound/telegram.js";
export { defaultFileName, extensionForMime, isAllowedImMime } from "./mime.js";
export { planDingTalkOutbound } from "./outbound/dingtalk.js";
export { planDiscordOutbound } from "./outbound/discord.js";
export { planFeishuOutbound } from "./outbound/feishu.js";
export { planSlackOutbound } from "./outbound/slack.js";
export { planTelegramOutbound } from "./outbound/telegram.js";
export type {
  DingTalkOutboundAction,
  FeishuOutboundAction,
  ImAttachmentRef,
  ImOutboundAction,
  ImPendingAttachment,
  ImPlatform,
  ParsedInboundImMessage,
  PlanImOutboundInput,
  SlackOutboundAction,
  TelegramOutboundAction,
} from "./types.js";
