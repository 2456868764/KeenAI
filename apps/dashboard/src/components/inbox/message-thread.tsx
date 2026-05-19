"use client";

import { useConversationStream } from "@/hooks/use-conversation-stream";
import type { Conversation, Message } from "@/lib/api";
import { getConversation, listMessages, sendMessage, updateConversation } from "@/lib/api";
import { Button, Input, cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";

export function MessageThread({ conversationId }: { conversationId: string | null }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

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

  const closeConv = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("no conversation");
      return updateConversation(conversationId, { status: "closed" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
  });

  const send = useMutation({
    mutationFn: (plainText: string) => {
      if (!conversationId) throw new Error("no conversation");
      return sendMessage(conversationId, plainText);
    },
    onMutate: async (plainText) => {
      if (!conversationId) return {};
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const prev = queryClient.getQueryData<{ items: Message[] }>(["messages", conversationId]);
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderType: "agent",
        senderId: null,
        plainText,
        isInternal: false,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(["messages", conversationId], {
        items: [...(prev?.items ?? []), optimistic],
      });
      setDraft("");
      return { prev };
    },
    onError: (_err, _text, ctx) => {
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
      <header className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">{conversation?.subject ?? "Conversation"}</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {conversation?.status} · {conversation?.channelType}
            {conversation?.unreadCount ? ` · ${conversation.unreadCount} unread` : ""}
          </p>
        </div>
        {conversation?.status !== "closed" ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={closeConv.isPending}
            onClick={() => closeConv.mutate()}
          >
            Close
          </Button>
        ) : null}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading messages…</p>
        ) : null}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      <footer className="border-t border-[hsl(var(--border))] p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || send.isPending) return;
            send.mutate(text);
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply… (⌘Enter to send)"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const text = draft.trim();
                if (text && !send.isPending) send.mutate(text);
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

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.senderType === "agent" || message.senderType === "ai";
  const isOptimistic = message.id.startsWith("optimistic-");

  return (
    <div className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
      <BubbleBody message={message} isAgent={isAgent} isOptimistic={isOptimistic} />
    </div>
  );
}

function BubbleBody({
  message,
  isAgent,
  isOptimistic,
}: {
  message: Message;
  isAgent: boolean;
  isOptimistic: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-[min(32rem,85%)] rounded-lg px-3 py-2 text-sm",
        isAgent
          ? "bg-[hsl(var(--widget-user-bubble))] text-[hsl(var(--primary-foreground))]"
          : "bg-[hsl(var(--widget-agent-bubble))] text-[hsl(var(--foreground))]",
        isOptimistic && "opacity-70",
      )}
    >
      <p className="whitespace-pre-wrap">{message.plainText}</p>
      <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
        {message.senderType}
        {isOptimistic ? " · sending" : ""}
      </p>
    </div>
  );
}
