"use client";

import type { Message } from "@/lib/api";
import { fetchAttachmentBlob } from "@/lib/api";
import { cn } from "@keenai/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

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

function MessageImage({ attachmentId }: { attachmentId: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchAttachmentBlob(attachmentId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="mt-2 max-h-64 max-w-full rounded-md object-contain" />
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.senderType === "agent" || message.senderType === "ai";
  const isOptimistic = message.id.startsWith("optimistic-");
  const imageAttachments =
    message.attachments?.filter((a) => a.contentType?.startsWith("image/")) ?? [];

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
        {message.plainText && !message.plainText.startsWith("[Image:") ? (
          <p className="whitespace-pre-wrap">{message.plainText}</p>
        ) : message.plainText ? (
          <p className="whitespace-pre-wrap text-[hsl(var(--muted-foreground))]">
            {message.plainText}
          </p>
        ) : null}
        {imageAttachments.map((att) => (
          <MessageImage key={att.id} attachmentId={att.id} />
        ))}
        <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          {message.isInternal ? "internal note" : message.senderType}
          {isOptimistic ? " · sending" : ""}
        </p>
      </div>
    </div>
  );
}
