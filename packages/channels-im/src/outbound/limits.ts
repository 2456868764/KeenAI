import type { ChannelOutboundLimits } from "@keenai/channels-core";
import type { ImPlatform } from "../types.js";

const IM_OUTBOUND_LIMITS = {
  telegram: limits(4096, 4096, 1024),
  slack: limits(4000, 3000),
  discord: limits(2000, 2000),
  feishu: limits(4000, 4000),
  dingtalk: limits(4000, 4000),
  whatsapp: limits(4096, 1024, 1024),
  wechat: limits(2048, 1024),
  wecom: limits(2048, 128),
} as const satisfies Record<ImPlatform, ChannelOutboundLimits>;

export function getImOutboundLimits(platform: ImPlatform): Readonly<ChannelOutboundLimits> {
  return IM_OUTBOUND_LIMITS[platform];
}

function limits(
  maxTextCharacters: number,
  maxInteractiveTextCharacters: number,
  maxCaptionCharacters: number | null = null,
): ChannelOutboundLimits {
  return {
    maxTextCharacters,
    maxInteractiveTextCharacters,
    maxCaptionCharacters,
    maxAttachmentBytes: null,
  };
}
