export type NotificationRealtimeEvent = {
  type: "notification.created";
  accountId: string;
  notification: unknown;
};

type Listener = (event: NotificationRealtimeEvent) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribeNotifications(accountId: string, listener: Listener): () => void {
  let set = channels.get(accountId);
  if (!set) {
    set = new Set();
    channels.set(accountId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) channels.delete(accountId);
  };
}

export function publishNotification(event: NotificationRealtimeEvent): void {
  const set = channels.get(event.accountId);
  if (!set) return;
  for (const listener of set) {
    listener(event);
  }
}
