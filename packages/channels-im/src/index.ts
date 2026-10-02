import { planDingTalkOutbound } from "./outbound/dingtalk.js";
import { planDiscordOutbound } from "./outbound/discord.js";
import { planFeishuOutbound } from "./outbound/feishu.js";
import { planSlackOutbound } from "./outbound/slack.js";
import { planTelegramOutbound } from "./outbound/telegram.js";
import { planWeChatOutbound } from "./outbound/wechat.js";
import { planWeComOutbound } from "./outbound/wecom.js";
import { planWhatsAppOutbound } from "./outbound/whatsapp.js";
import type { ImOutboundAction, PlanImOutboundInput } from "./types.js";

export function planImOutbound(input: PlanImOutboundInput): ImOutboundAction[] {
  if (input.platform === "telegram") return planTelegramOutbound(input);
  if (input.platform === "discord") return planDiscordOutbound(input);
  if (input.platform === "feishu") return planFeishuOutbound(input);
  if (input.platform === "dingtalk") return planDingTalkOutbound(input);
  if (input.platform === "whatsapp") return planWhatsAppOutbound(input);
  if (input.platform === "wechat") return planWeChatOutbound(input);
  if (input.platform === "wecom") return planWeComOutbound(input);
  return planSlackOutbound(input);
}

export { adaptDingTalkRobot, type DingTalkRobotPayload } from "./inbound/dingtalk.js";
export { adaptDiscordEvent, type DiscordGatewayPayload } from "./inbound/discord.js";
export {
  adaptFeishuEvent,
  feishuUrlVerificationChallenge,
  parseFeishuDeliveryReceipts,
  type FeishuEventPayload,
} from "./inbound/feishu.js";
export { adaptSlackEvent, slackUrlVerificationChallenge } from "./inbound/slack.js";
export {
  adaptTelegramUpdate,
  splitTelegramUpdate,
  telegramUpdateEventId,
  type TelegramUpdate,
} from "./inbound/telegram.js";
export { adaptWeChatMessage, type WeChatMessagePayload } from "./inbound/wechat.js";
export {
  adaptWhatsAppWebhook,
  parseWhatsAppDeliveryReceipts,
  splitWhatsAppMessageWebhooks,
  type WhatsAppWebhookPayload,
} from "./inbound/whatsapp.js";
export { adaptWeComMessage, type WeComMessagePayload } from "./inbound/wecom.js";
export { defaultFileName, extensionForMime, isAllowedImMime } from "./mime.js";
export { planDingTalkOutbound } from "./outbound/dingtalk.js";
export {
  decryptDingTalkPayload,
  encryptDingTalkResponse,
  verifyDingTalkSignature,
  type DingTalkCryptoConfig,
} from "./dingtalk-crypto.js";
export { planDiscordOutbound } from "./outbound/discord.js";
export { planFeishuOutbound } from "./outbound/feishu.js";
export { planSlackOutbound } from "./outbound/slack.js";
export { getImOutboundLimits } from "./outbound/limits.js";
export { planTelegramOutbound } from "./outbound/telegram.js";
export { planWhatsAppOutbound } from "./outbound/whatsapp.js";
export { planWeChatOutbound } from "./outbound/wechat.js";
export { planWeComOutbound } from "./outbound/wecom.js";
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
  WhatsAppOutboundAction,
  WeChatOutboundAction,
  WeComOutboundAction,
} from "./types.js";
export {
  createDefaultImPlugins,
  createImChannelPlugin,
  type ImChannelPluginOptions,
  type ImMessageOperationExecutor,
  type ImOutboundActionExecutor,
} from "./plugin.js";
export {
  decryptWeChatPayload,
  parseWeChatMessageXml,
  readWeChatXmlTag,
  verifyWeChatMessageSignature,
  verifyWeChatSignature,
  type WeChatCryptoConfig,
} from "./wechat-crypto.js";
export {
  decryptWeComPayload,
  parseWeComMessageXml,
  readWeComXmlTag,
  verifyWeComSignature,
  type WeComCryptoConfig,
} from "./wecom-crypto.js";
