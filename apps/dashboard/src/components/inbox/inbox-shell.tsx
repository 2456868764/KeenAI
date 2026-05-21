"use client";

import { listConversations, searchConversations, type Conversation } from "@/lib/api";
import { NotificationBell } from "./notification-bell";
import { clearAccessToken } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CopilotCommand } from "./copilot-command";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { type InboxView, ViewsSidebar, viewToStatusFilter } from "./views-sidebar";

export function InboxShell() {
  const router = useRouter();
  const [view, setView] = useState<InboxView>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotDraft, setCopilotDraft] = useState<{
    text: string;
    providerId: string;
  } | null>(null);

  const status = viewToStatusFilter(view);
  const trimmedSearch = searchQuery.trim();

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", status, view, trimmedSearch],
    queryFn: async () => {
      if (trimmedSearch) {
        const result = await searchConversations(trimmedSearch);
        return { items: result.items, nextCursor: null as string | null };
      }
      return listConversations(status ? { status } : undefined);
    },
    refetchInterval: trimmedSearch ? false : 30_000,
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (view === "unassigned") {
      return list.filter((c: Conversation) => !c.status || c.status === "open");
    }
    return list;
  }, [data?.items, view]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCopilotOpen(true);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (items.length === 0) return;

      const idx = selectedId ? items.findIndex((c) => c.id === selectedId) : -1;

      if (e.key === "j") {
        e.preventDefault();
        const next = items[Math.min(idx < 0 ? 0 : idx + 1, items.length - 1)];
        if (next) setSelectedId(next.id);
      }
      if (e.key === "k") {
        e.preventDefault();
        const prev = items[Math.max(idx < 0 ? 0 : idx - 1, 0)];
        if (prev) setSelectedId(prev.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, selectedId]);

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
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
        <MessageThread
          conversationId={selectedId}
          copilotDraft={copilotDraft}
          onCopilotDraftApplied={() => setCopilotDraft(null)}
        />
      </div>
      <CopilotCommand
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        conversationId={selectedId}
        onDraft={(text, meta) => setCopilotDraft({ text, providerId: meta.providerId })}
      />
    </div>
  );
}

function TopBar({
  searchQuery,
  onSearchChange,
  onLogout,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded bg-[hsl(var(--primary))] text-[10px] font-bold text-[hsl(var(--primary-foreground))]">
          K
        </span>
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">Inbox</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Demo Workspace</span>
      </div>
      <input
        type="search"
        placeholder="Search conversations…"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 max-w-xs flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
      />
      <div className="flex items-center gap-2">
        <NotificationBell />
        <button
          type="button"
          onClick={onLogout}
          className="rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
