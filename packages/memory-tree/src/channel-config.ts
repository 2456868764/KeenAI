/** Channel types that get a shared source tree (`channel:type:id`). */
export const CHANNEL_SCOPED_TREE_TYPES = ["slack", "telegram"] as const;

export type ChannelScopedTreeType = (typeof CHANNEL_SCOPED_TREE_TYPES)[number];

export function isChannelScopedTreeType(channelType: string): channelType is ChannelScopedTreeType {
  return (CHANNEL_SCOPED_TREE_TYPES as readonly string[]).includes(channelType);
}
