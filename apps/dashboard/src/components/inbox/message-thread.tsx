"use client";

import { ConversationActions } from "@/components/inbox/conversation-actions";
import { VirtualMessageList } from "@/components/inbox/virtual-message-list";
import { useConversationStream } from "@/hooks/use-conversation-stream";
import type { Conversation, Message } from "@/lib/api";
import { getConversation, listMessages, sendMessage } from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";

export function MessageThread({ conversationId }: { conversationId: string | null }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  useConversationStream(conversationId);

  const activeId = conversationId ?? "";

  const { data: meta } = useQuery({
    queryKey: ["conversation", activeId],
    queryFn: () => {
      if (!conversationId) throw new Error("no conversation");
      return getConversation(conversationId);
    },
    enabled: !!conversationId,
  });

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => {
      if (!conversationId) throw new Error("no conversation");
      return listMessages(conversationId);
    },
    enabled: !!conversationId,
  });

  const send = useMutation({
    mutationFn: (input: { plainText: string; isInternal: boolean }) => {
      if (!conversationId) throw new Error("no conversation");
      return sendMessage(conversationId, input.plainText, { isInternal: input.isInternal });
    },
    onMutate: async (input) => {
      if (!conversationId) return {};
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const prev = queryClient.getQueryData<{ items: Message[] }>(["messages", conversationId]);
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderType: "agent",
        senderId: null,
        plainText: input.plainText,
        isInternal: input.isInternal,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(["messages", conversationId], {
        items: [...(prev?.items ?? []), optimistic],
      });
      setDraft("");
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["messages", conversationId], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  if (!conversationId) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
        Select a conversation to view messages
      </section>
    );
  }

  const conversation: Conversation | undefined = meta?.conversation;
  const messages = messagesData?.items ?? [];

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[hsl(var(--surface-0))]">
      <header className="border-b border-[hsl(var(--border))] px-6 py-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold">{conversation?.subject ?? "Conversation"}</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {conversation?.status}
            {conversation?.snoozedUntil
              ? ` · snoozed until ${new Date(conversation.snoozedUntil).toLocaleString()}`
              : ""}
            {conversation?.assigneeId ? ` · assignee ${conversation.assigneeId}` : ""}
            {conversation?.tags?.length ? ` · ${conversation.tags.join(", ")}` : ""}
            {conversation?.unreadCount ? ` · ${conversation.unreadCount} unread` : ""}
          </p>
        </div>
        <ConversationActions conversationId={conversationId} conversation={conversation} />
      </header>

      <VirtualMessageList messages={messages} isLoading={isLoading} />

      <footer className="border-t border-[hsl(var(--border))] p-4">
        <label className="mb-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
          />
          Internal note (not visible to customer)
        </label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || send.isPending) return;
            send.mutate({ plainText: text, isInternal });
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={isInternal ? "Internal note…" : "Reply… (⌘Enter to send)"}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const text = draft.trim();
                if (text && !send.isPending) send.mutate({ plainText: text, isInternal });
              }
            }}
          />
          <Button type="submit" disabled={send.isPending || !draft.trim()}>
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </footer>
    </section>
  );
}
