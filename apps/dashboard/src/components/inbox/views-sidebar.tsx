"use client";

import { cn } from "@keenai/ui";
import { Inbox, MessageSquare, Moon, User } from "lucide-react";

export type InboxView = "all" | "open" | "unassigned" | "mine";

const VIEWS: { id: InboxView; label: string; icon: typeof Inbox }[] = [
  { id: "all", label: "All messages", icon: MessageSquare },
  { id: "open", label: "Open", icon: Inbox },
  { id: "unassigned", label: "Unassigned", icon: User },
  { id: "mine", label: "My inbox", icon: Moon },
];

export function viewToStatusFilter(view: InboxView): string | undefined {
  if (view === "open") return "open";
  return undefined;
}

export function ViewsSidebar({
  active,
  onChange,
}: {
  active: InboxView;
  onChange: (view: InboxView) => void;
}) {
  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
      <InboxSidebarHeader />
      <nav className="flex-1 space-y-0.5 p-2">
        <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Inbox
        </p>
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const selected = active === view.id;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onChange(view.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                selected
                  ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{view.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function InboxSidebarHeader() {
  return (
    <div className="border-b border-[hsl(var(--border))] px-4 py-4">
      <h1 className="text-sm font-semibold tracking-tight">KeenAI</h1>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Support Inbox</p>
    </div>
  );
}
