"use client";

import type { Message } from "@/lib/api";
import { fetchAttachmentBlob } from "@/lib/api";
import { cn } from "@keenai/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Pencil, SmilePlus, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const ESTIMATE_PX = 76;

export function VirtualMessageList({
  messages,
  isLoading,
  capabilities,
  currentActorId,
  onEditMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
}: {
  messages: Message[];
  isLoading?: boolean;
  capabilities?: MessageOperationCapabilities;
  currentActorId?: string | null;
  onEditMessage?: (messageId: string, plainText: string) => Promise<unknown>;
  onDeleteMessage?: (messageId: string) => Promise<unknown>;
  onAddReaction?: (messageId: string, emoji: string) => Promise<unknown>;
  onRemoveReaction?: (messageId: string, emoji: string) => Promise<unknown>;
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
              <MessageBubble
                message={msg}
                capabilities={capabilities}
                currentActorId={currentActorId}
                onEditMessage={onEditMessage}
                onDeleteMessage={onDeleteMessage}
                onAddReaction={onAddReaction}
                onRemoveReaction={onRemoveReaction}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MessageOperationCapabilities = {
  edit?: boolean;
  delete?: boolean;
  reactions?: boolean;
};

type MessageBubbleProps = {
  message: Message;
  capabilities?: MessageOperationCapabilities;
  currentActorId?: string | null;
  onEditMessage?: (messageId: string, plainText: string) => Promise<unknown>;
  onDeleteMessage?: (messageId: string) => Promise<unknown>;
  onAddReaction?: (messageId: string, emoji: string) => Promise<unknown>;
  onRemoveReaction?: (messageId: string, emoji: string) => Promise<unknown>;
};

const QUICK_REACTIONS = ["👍", "❤️", "🎉", "👀"] as const;

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

function MessageAudio({ attachment }: { attachment: NonNullable<Message["attachments"]>[number] }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchAttachmentBlob(attachment.id)
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
  }, [attachment.id]);

  const transcript = attachment.metadata?.transcript?.trim();

  return (
    <div className="mt-2 space-y-1">
      {src ? (
        <>
          {/* biome-ignore lint/a11y/useMediaCaption: transcript is shown below when available */}
          <audio
            controls
            preload="none"
            src={src}
            className="max-w-full"
            aria-label="Voice message"
          />
        </>
      ) : (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Voice message</p>
      )}
      {transcript ? (
        <details className="text-xs text-[hsl(var(--muted-foreground))]">
          <summary className="cursor-pointer select-none">Transcript</summary>
          <p className="mt-1 whitespace-pre-wrap text-[hsl(var(--foreground))]">{transcript}</p>
        </details>
      ) : null}
    </div>
  );
}

function MessageVideo({ attachment }: { attachment: NonNullable<Message["attachments"]>[number] }) {
  const [src, setSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    let videoUrl: string | null = null;
    let posterUrl: string | null = null;
    let cancelled = false;

    void fetchAttachmentBlob(attachment.id, "content")
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        videoUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));

    if (attachment.thumbnailUrl) {
      void fetchAttachmentBlob(attachment.id, "thumbnail")
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          posterUrl = url;
          setPoster(url);
        })
        .catch(() => setPoster(null));
    }

    return () => {
      cancelled = true;
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (posterUrl) URL.revokeObjectURL(posterUrl);
    };
  }, [attachment.id, attachment.thumbnailUrl]);

  return (
    <div className="mt-2">
      {src ? (
        <>
          {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded video without captions */}
          <video
            controls
            preload="metadata"
            src={src}
            poster={poster ?? undefined}
            className="max-h-64 max-w-full rounded-md"
            aria-label={attachment.fileName ?? "Video attachment"}
          />
        </>
      ) : (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {attachment.fileName ?? "Video"}
        </p>
      )}
    </div>
  );
}

function MessageFile({ attachment }: { attachment: NonNullable<Message["attachments"]>[number] }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchAttachmentBlob(attachment.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setHref(url);
      })
      .catch(() => setHref(null));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  const label = formatAttachmentLabel(attachment.fileName ?? "attachment", attachment.sizeBytes);

  return (
    <a
      href={href ?? undefined}
      download={attachment.fileName ?? "attachment"}
      className="mt-2 flex max-w-full items-center rounded-md border border-[hsl(var(--border))] px-2 py-1.5 text-xs underline-offset-2 hover:underline"
    >
      <span className="min-w-0 truncate">{label}</span>
    </a>
  );
}

function MessageBubble({
  message,
  capabilities,
  currentActorId,
  onEditMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.plainText);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [pending, setPending] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const isAgent = message.senderType === "agent" || message.senderType === "ai";
  const isOptimistic = message.id.startsWith("optimistic-");
  const isDeleted = Boolean(message.deletedAt);
  const bubbleTone = message.isInternal ? "internal" : isAgent ? "agent" : "customer";
  const subtleTextClass =
    bubbleTone === "agent"
      ? "text-white/75"
      : bubbleTone === "customer"
        ? "text-[hsl(var(--muted-foreground))]"
        : "text-amber-700";
  const imageAttachments =
    message.attachments?.filter((a) => a.contentType?.startsWith("image/")) ?? [];
  const audioAttachments =
    message.attachments?.filter((a) => a.contentType?.startsWith("audio/")) ?? [];
  const videoAttachments =
    message.attachments?.filter((a) => a.contentType?.startsWith("video/")) ?? [];
  const fileAttachments =
    message.attachments?.filter((a) => {
      const mime = a.contentType ?? "";
      return !mime.startsWith("image/") && !mime.startsWith("audio/") && !mime.startsWith("video/");
    }) ?? [];
  const showPlainText = Boolean(
    !isDeleted &&
      message.plainText?.trim() &&
      audioAttachments.length === 0 &&
      videoAttachments.length === 0 &&
      !message.plainText.startsWith("[Image:"),
  );

  const canEdit =
    !message.isInternal && !isOptimistic && !isDeleted && isAgent && capabilities?.edit;
  const canDelete =
    !message.isInternal && !isOptimistic && !isDeleted && isAgent && capabilities?.delete;
  const canReact = !message.isInternal && !isOptimistic && !isDeleted && capabilities?.reactions;
  const groupedReactions = groupReactions(message, currentActorId);

  async function runOperation(operation: () => Promise<unknown>, after?: () => void) {
    setPending(true);
    setOperationError(null);
    try {
      await operation();
      after?.();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("group flex pb-3", isAgent ? "justify-end" : "justify-start")}>
      <div className="max-w-[min(32rem,85%)]">
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            message.isInternal
              ? "border border-dashed border-amber-500/50 bg-amber-500/10 text-[hsl(var(--foreground))]"
              : isAgent
                ? "bg-[hsl(var(--widget-user-bubble))] text-[hsl(var(--primary-foreground))]"
                : "bg-[hsl(var(--widget-agent-bubble))] text-[hsl(var(--foreground))]",
            isOptimistic && "opacity-70",
          )}
        >
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                disabled={pending}
                rows={3}
                aria-label="Edit message"
                className="w-full resize-y rounded-md border border-white/30 bg-black/10 px-2 py-1.5 text-sm text-inherit outline-none focus:ring-1 focus:ring-white/70"
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  title="Cancel edit"
                  aria-label="Cancel edit"
                  disabled={pending}
                  onClick={() => {
                    setEditText(message.plainText);
                    setEditing(false);
                  }}
                  className="rounded p-1 hover:bg-white/15 disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
                <button
                  type="button"
                  title="Save edit"
                  aria-label="Save edit"
                  disabled={pending || !editText.trim() || !onEditMessage}
                  onClick={() =>
                    onEditMessage &&
                    void runOperation(
                      () => onEditMessage(message.id, editText.trim()),
                      () => setEditing(false),
                    )
                  }
                  className="rounded p-1 hover:bg-white/15 disabled:opacity-50"
                >
                  <Check className="size-4" />
                </button>
              </div>
            </div>
          ) : isDeleted ? (
            <p className={cn("italic", subtleTextClass)}>Message deleted</p>
          ) : showPlainText ? (
            <p className="whitespace-pre-wrap">{message.plainText}</p>
          ) : message.plainText &&
            audioAttachments.length === 0 &&
            videoAttachments.length === 0 ? (
            <p className={cn("whitespace-pre-wrap", subtleTextClass)}>{message.plainText}</p>
          ) : null}
          {!isDeleted &&
            imageAttachments.map((att) => <MessageImage key={att.id} attachmentId={att.id} />)}
          {!isDeleted &&
            audioAttachments.map((att) => <MessageAudio key={att.id} attachment={att} />)}
          {!isDeleted &&
            videoAttachments.map((att) => <MessageVideo key={att.id} attachment={att} />)}
          {!isDeleted &&
            fileAttachments.map((att) => <MessageFile key={att.id} attachment={att} />)}
          <p className={cn("mt-1 text-[10px]", subtleTextClass)}>
            {message.isInternal ? "internal note" : message.senderType}
            {message.editedAt && !isDeleted ? " · edited" : ""}
            {isOptimistic ? " · sending" : ""}
          </p>
        </div>
        {groupedReactions.length > 0 ? (
          <div className={cn("mt-1 flex flex-wrap gap-1", isAgent && "justify-end")}>
            {groupedReactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                disabled={pending || !canReact}
                title={reaction.mine ? "Remove reaction" : "Add reaction"}
                onClick={() => {
                  const callback = reaction.mine ? onRemoveReaction : onAddReaction;
                  if (!callback) return;
                  void runOperation(() => callback(message.id, reaction.emoji));
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  reaction.mine
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)]"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]",
                )}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        ) : null}
        {confirmingDelete ? (
          <div
            className={cn(
              "mt-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]",
              isAgent && "justify-end",
            )}
          >
            <span>Delete this message?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-[hsl(var(--border))] px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !onDeleteMessage}
              onClick={() =>
                onDeleteMessage &&
                void runOperation(
                  () => onDeleteMessage(message.id),
                  () => setConfirmingDelete(false),
                )
              }
              className="rounded bg-[hsl(var(--danger))] px-2 py-1 text-white disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ) : null}
        {showReactions ? (
          <div className={cn("mt-1 flex gap-1", isAgent && "justify-end")}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={pending || !onAddReaction}
                onClick={() =>
                  onAddReaction &&
                  void runOperation(
                    () => onAddReaction(message.id, emoji),
                    () => setShowReactions(false),
                  )
                }
                className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm hover:bg-[hsl(var(--surface-2))]"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {operationError ? (
          <p className={cn("mt-1 text-xs text-[hsl(var(--danger))]", isAgent && "text-right")}>
            {operationError}
          </p>
        ) : null}
        {(canEdit || canDelete || canReact) && !editing && !confirmingDelete ? (
          <div
            className={cn(
              "mt-1 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
              isAgent && "justify-end",
            )}
          >
            {canReact ? (
              <MessageActionButton
                label="Add reaction"
                onClick={() => setShowReactions((value) => !value)}
              >
                <SmilePlus className="size-3.5" />
              </MessageActionButton>
            ) : null}
            {canEdit ? (
              <MessageActionButton
                label="Edit message"
                onClick={() => {
                  setEditText(message.plainText);
                  setEditing(true);
                  setShowReactions(false);
                }}
              >
                <Pencil className="size-3.5" />
              </MessageActionButton>
            ) : null}
            {canDelete ? (
              <MessageActionButton
                label="Delete message"
                onClick={() => {
                  setConfirmingDelete(true);
                  setShowReactions(false);
                }}
              >
                <Trash2 className="size-3.5" />
              </MessageActionButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
    >
      {children}
    </button>
  );
}

function groupReactions(message: Message, currentActorId?: string | null) {
  const grouped = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const reaction of message.reactions ?? []) {
    const current = grouped.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
    };
    current.count += 1;
    current.mine ||= Boolean(currentActorId && reaction.actorId === currentActorId);
    grouped.set(reaction.emoji, current);
  }
  return [...grouped.values()];
}

function formatAttachmentLabel(fileName: string, sizeBytes: number | null | undefined): string {
  if (!sizeBytes || sizeBytes < 1) return fileName;
  if (sizeBytes < 1024) return `${fileName} · ${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${fileName} · ${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${fileName} · ${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
