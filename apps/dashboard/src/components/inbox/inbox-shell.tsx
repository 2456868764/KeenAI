"use client";

import { AppHeader } from "@/components/layout/app-header";
import { type Conversation, listConversations, searchConversations } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ConversationList } from "./conversation-list";
import { CopilotCommand } from "./copilot-command";
import { MessageThread } from "./message-thread";
import { NotificationBell } from "./notification-bell";
import { type InboxView, ViewsSidebar, viewToStatusFilter } from "./views-sidebar";

export function InboxShell() {
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
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
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
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  return (
    <AppHeader title="Inbox">
      <input
        type="search"
        placeholder="Search conversations…"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 max-w-xs flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
      />
      <NotificationBell />
    </AppHeader>
  );
}
