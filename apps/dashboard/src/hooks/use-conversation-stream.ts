"use client";

import { conversationStreamUrl } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** SSE → invalidate TanStack Query caches for inbox list + active thread. */
export function useConversationStream(conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const url = conversationStreamUrl(conversationId);
    if (!url) return;

    const es = new EventSource(url);

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    };

    es.addEventListener("message.created", invalidate);
    es.addEventListener("message.updated", invalidate);
    es.addEventListener("conversation.updated", invalidate);

    es.onerror = () => {
      /* browser auto-reconnects EventSource */
    };

    return () => es.close();
  }, [conversationId, queryClient]);
}
