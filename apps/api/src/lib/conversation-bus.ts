export type ConversationRealtimeEvent =
  | { type: "message.created"; conversationId: string; message: unknown }
  | { type: "message.updated"; conversationId: string; message: unknown }
  | { type: "conversation.updated"; conversationId: string; conversation: unknown };

type Listener = (event: ConversationRealtimeEvent) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribeConversation(conversationId: string, listener: Listener): () => void {
  let set = channels.get(conversationId);
  if (!set) {
    set = new Set();
    channels.set(conversationId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) channels.delete(conversationId);
  };
}

export function publishConversation(event: ConversationRealtimeEvent): void {
  const set = channels.get(event.conversationId);
  if (!set) return;
  for (const listener of set) {
    listener(event);
  }
}
