/** Topic tree scope key for a customer (Memory Tree §4.2). */
export function customerScopeKey(userId: string): string {
  return `customer:${userId}`;
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
