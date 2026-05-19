"use client";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
      >
        Notifications
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1 text-[10px] font-medium text-[hsl(var(--primary-foreground))]">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-lg">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
            <span className="text-xs font-medium">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                className="text-[10px] text-[hsl(var(--primary))] hover:underline"
                onClick={() => markAll.mutate()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                No notifications
              </li>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onRead={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                  }}
                />
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onRead}
        className={`w-full px-3 py-2 text-left text-xs hover:bg-[hsl(var(--surface-2))] ${
          notification.readAt ? "opacity-60" : ""
        }`}
      >
        <p className="font-medium text-[hsl(var(--foreground))]">{notification.title}</p>
        {notification.body ? (
          <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">{notification.body}</p>
        ) : null}
      </button>
    </li>
  );
}
