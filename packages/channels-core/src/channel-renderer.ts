import type { OutboundDirectives, OutboundPart } from "@keenai/shared";

export type RenderContext = {
  orgId: string;
  conversationId: string;
  channelType: string;
  channelId: string;
};

export interface ChannelRenderer {
  sendParts(
    ctx: RenderContext,
    parts: OutboundPart[],
    directives?: OutboundDirectives,
  ): Promise<string[]>;
}
