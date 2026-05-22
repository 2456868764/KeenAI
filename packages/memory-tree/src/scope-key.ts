/** Source tree scope key for a conversation (Memory Tree §4.1). */
export function conversationScopeKey(conversationId: string): string {
  return `conv:${conversationId}`;
}

/** Parse conversation id from a `conv:*` scope key. */
export function conversationIdFromScopeKey(scopeKey: string): string | null {
  if (!scopeKey.startsWith("conv:")) return null;
  const id = scopeKey.slice("conv:".length);
  return id.length > 0 ? id : null;
}
