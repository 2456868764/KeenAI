/** Topic tree scope key for a customer (Memory Tree §4.2). */
export function customerScopeKey(userId: string): string {
  return `customer:${userId}`;
}

/** Shared source tree scope key for an IM channel (Memory Tree §4.1). */
export function channelScopeKey(channelType: string, channelId: string): string {
  return `channel:${channelType}:${channelId}`;
}

/** Parse channel type + id from a `channel:*` scope key. */
export function parseChannelScopeKey(
  scopeKey: string,
): { channelType: string; channelId: string } | null {
  if (!scopeKey.startsWith("channel:")) return null;
  const rest = scopeKey.slice("channel:".length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const channelType = rest.slice(0, sep);
  const channelId = rest.slice(sep + 1);
  if (!channelType || !channelId) return null;
  return { channelType, channelId };
}

/** Map a source-tree scope key to episode scope + id. */
export function episodeTargetFromScopeKey(scopeKey: string): {
  scope: string;
  scopeId: string;
} {
  const conversationId = conversationIdFromScopeKey(scopeKey);
  if (conversationId) return { scope: "conversation", scopeId: conversationId };

  const customerId = customerIdFromScopeKey(scopeKey);
  if (customerId) return { scope: "customer", scopeId: customerId };

  const channel = parseChannelScopeKey(scopeKey);
  if (channel) return { scope: "channel", scopeId: `${channel.channelType}:${channel.channelId}` };

  return { scope: "unknown", scopeId: scopeKey };
}

/** Parse customer user id from a `customer:*` scope key. */
export function customerIdFromScopeKey(scopeKey: string): string | null {
  if (!scopeKey.startsWith("customer:")) return null;
  const id = scopeKey.slice("customer:".length);
  return id.length > 0 ? id : null;
}

/** Source tree scope key for a conversation (Memory Tree §4.1). */
export function conversationScopeKey(conversationId: string): string {
  return `conv:${conversationId}`;
}

/** Global tree scope key for a brand daily digest (Memory Tree §4.3). */
export function brandDailyScopeKey(brandId: string, dateUtc: string): string {
  return `brand:${brandId}:day:${dateUtc}`;
}

/** Parse conversation id from a `conv:*` scope key. */
export function conversationIdFromScopeKey(scopeKey: string): string | null {
  if (!scopeKey.startsWith("conv:")) return null;
  const id = scopeKey.slice("conv:".length);
  return id.length > 0 ? id : null;
}

/** Parse brand id + UTC date from a global daily scope key. */
export function parseBrandDailyScopeKey(
  scopeKey: string,
): { brandId: string; dateUtc: string } | null {
  const match = scopeKey.match(/^brand:([^:]+):day:(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  return { brandId: match[1] ?? "", dateUtc: match[2] ?? "" };
}
