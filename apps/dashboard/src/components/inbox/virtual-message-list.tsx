"use client";

import type { Message } from "@/lib/api";
import { cn } from "@keenai/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

const ESTIMATE_PX = 76;

export function VirtualMessageList({
  messages,
  isLoading,
}: {
  messages: Message[];
  isLoading?: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE_PX,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-6 py-4" role="log" aria-live="polite">
      {isLoading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading messages…</p>
      ) : null}
      {!isLoading && messages.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No messages yet.</p>
      ) : null}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const msg = messages[row.index];
          if (!msg) return null;
          return (
            <div
              key={msg.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
              }}
            >
              <MessageBubble message={msg} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.senderType === "agent" || message.senderType === "ai";
  const isOptimistic = message.id.startsWith("optimistic-");

  return (
    <div className={cn("flex pb-3", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(32rem,85%)] rounded-lg px-3 py-2 text-sm",
          message.isInternal
            ? "border border-dashed border-amber-500/50 bg-amber-500/10 text-[hsl(var(--foreground))]"
            : isAgent
              ? "bg-[hsl(var(--widget-user-bubble))] text-[hsl(var(--primary-foreground))]"
              : "bg-[hsl(var(--widget-agent-bubble))] text-[hsl(var(--foreground))]",
          isOptimistic && "opacity-70",
        )}
      >
        <p className="whitespace-pre-wrap">{message.plainText}</p>
        <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          {message.isInternal ? "internal note" : message.senderType}
          {isOptimistic ? " · sending" : ""}
        </p>
      </div>
    </div>
  );
}
