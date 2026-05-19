"use client";

import type { Conversation } from "@/lib/api";
import { updateConversation } from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

function snoozeIso(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

export function ConversationActions({
  conversationId,
  conversation,
}: {
  conversationId: string;
  conversation?: Conversation;
}) {
  const queryClient = useQueryClient();
  const [assigneeId, setAssigneeId] = useState(conversation?.assigneeId ?? "");
  const [tagsDraft, setTagsDraft] = useState((conversation?.tags ?? []).join(", "));

  useEffect(() => {
    setAssigneeId(conversation?.assigneeId ?? "");
    setTagsDraft((conversation?.tags ?? []).join(", "));
  }, [conversation?.assigneeId, conversation?.tags]);

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof updateConversation>[1]) =>
      updateConversation(conversationId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={patch.isPending}
        onClick={() => patch.mutate({ snoozedUntil: snoozeIso(1) })}
      >
        Snooze 1h
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={patch.isPending}
        onClick={() => patch.mutate({ snoozedUntil: null, status: "open" })}
      >
        Unsnooze
      </Button>
      <Input
        className="h-8 w-28 text-xs"
        placeholder="Assignee ID"
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        onBlur={() => {
          const v = assigneeId.trim();
          patch.mutate({ assigneeId: v || null });
        }}
      />
      <Input
        className="h-8 min-w-[8rem] flex-1 text-xs"
        placeholder="Tags (comma)"
        value={tagsDraft}
        onChange={(e) => setTagsDraft(e.target.value)}
        onBlur={() => {
          const tags = tagsDraft
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          patch.mutate({ tags });
        }}
      />
      {conversation?.status !== "closed" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={patch.isPending}
          onClick={() => patch.mutate({ status: "closed" })}
        >
          Close
        </Button>
      ) : null}
    </div>
  );
}
