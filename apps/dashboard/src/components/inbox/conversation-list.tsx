"use client";

import type { Conversation } from "@/lib/api";
import { cn } from "@keenai/ui";

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function ConversationList({
  items,
  selectedId,
  onSelect,
  loading,
}: {
  items: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}) {
  return (
    <section className="flex h-full w-[280px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
      <div className="border-b border-[hsl(var(--border))] px-4 py-3">
        <h2 className="text-sm font-medium">Conversations</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {loading ? "Loading…" : `${items.length} shown`}
        </p>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {items.length === 0 && !loading ? (
          <li className="p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            All caught up — no conversations match this view.
          </li>
        ) : null}
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-[hsl(var(--border))] px-4 py-3 text-left transition-colors",
                  selected ? "bg-[hsl(var(--surface-2))]" : "hover:bg-[hsl(var(--surface-1))]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-1 text-sm font-medium">
                    {item.subject ?? `Conversation ${item.id.slice(-6)}`}
                  </span>
                  <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
                    {formatRelative(item.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <span className="capitalize">{item.status}</span>
                  <span>·</span>
                  <span>{item.channelType}</span>
                  {item.unreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {item.unreadCount}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
