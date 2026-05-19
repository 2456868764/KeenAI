"use client";

import { listConversations } from "@/lib/api";
import { clearAccessToken } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { type InboxView, ViewsSidebar, viewToStatusFilter } from "./views-sidebar";

export function InboxShell() {
  const router = useRouter();
  const [view, setView] = useState<InboxView>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const status = viewToStatusFilter(view);

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", status, view],
    queryFn: () => listConversations(status ? { status } : undefined),
    refetchInterval: 30_000,
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (view === "unassigned") {
      return list.filter((c) => !c.status || c.status === "open");
    }
    return list;
  }, [data?.items, view]);

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        onLogout={() => {
          clearAccessToken();
          router.replace("/login");
        }}
      />
      <div className="flex min-h-0 flex-1">
        <ViewsSidebar active={view} onChange={setView} />
        <ConversationList
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={isLoading}
        />
        <MessageThread conversationId={selectedId} />
      </div>
    </div>
  );
}

function TopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded bg-[hsl(var(--primary))] text-[10px] font-bold text-[hsl(var(--primary-foreground))]">
          K
        </span>
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">Inbox</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Demo Workspace</span>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
      >
        Sign out
      </button>
    </header>
  );
}
