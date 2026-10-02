"use client";

import { ConversationActions } from "@/components/inbox/conversation-actions";
import { RichTextComposer } from "@/components/inbox/rich-text-composer";
import { SlaBreachBadge } from "@/components/inbox/sla-breach-badge";
import { VirtualMessageList } from "@/components/inbox/virtual-message-list";
import { useConversationStream } from "@/hooks/use-conversation-stream";
import type { Conversation, Message, OutboundDirectives, WhatsAppTemplate } from "@/lib/api";
import {
  addMessageReaction,
  deleteMessage,
  editMessage,
  fetchMe,
  getConversation,
  listConversationChannelTemplates,
  listMacros,
  listMembers,
  listMessages,
  recordCopilotEvent,
  removeMessageReaction,
  sendMessage,
  sendTyping,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type MessageOperation =
  | { type: "edit"; messageId: string; plainText: string }
  | { type: "delete"; messageId: string }
  | { type: "reaction.add" | "reaction.remove"; messageId: string; emoji: string };

export function MessageThread({
  conversationId,
  copilotDraft,
  onCopilotDraftApplied,
}: {
  conversationId: string | null;
  copilotDraft?: { text: string; providerId: string } | null;
  onCopilotDraftApplied?: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [showTemplateComposer, setShowTemplateComposer] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateComponents, setTemplateComponents] = useState("[]");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const lastTypingAtRef = useRef(0);
  const [copilotMeta, setCopilotMeta] = useState<{ providerId: string; length: number } | null>(
    null,
  );

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

  const { data: membersData } = useQuery({
    queryKey: ["members"],
    queryFn: listMembers,
  });

  const { data: macrosData } = useQuery({
    queryKey: ["macros"],
    queryFn: listMacros,
  });

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const supportsTemplates =
    meta?.conversation.channelType === "whatsapp" &&
    meta.conversation.channelCapabilities?.includes("templates");
  const { data: channelTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ["conversation-channel-templates", activeId],
    queryFn: () => {
      if (!conversationId) throw new Error("no conversation");
      return listConversationChannelTemplates(conversationId);
    },
    enabled: Boolean(conversationId && supportsTemplates),
  });

  const send = useMutation({
    mutationFn: (input: {
      plainText: string;
      isInternal: boolean;
      doc?: Record<string, unknown>;
      attachmentIds?: string[];
      directives?: OutboundDirectives;
    }) => {
      if (!conversationId) throw new Error("no conversation");
      return sendMessage(conversationId, input.plainText, {
        isInternal: input.isInternal,
        content: input.doc ? { type: "tiptap", doc: input.doc } : undefined,
        attachmentIds: input.attachmentIds,
        directives: input.directives,
      });
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
      return { prev, input };
    },
    onSuccess: (_data, _input, ctx) => {
      if (!conversationId || !ctx?.input) return;
      if (copilotMeta && ctx.input.plainText) {
        const edited = copilotMeta.length > 0 && ctx.input.plainText.length !== copilotMeta.length;
        void recordCopilotEvent({
          conversationId,
          action: edited ? "edit" : "accept",
          draftLength: ctx.input.plainText.length,
          providerId: copilotMeta.providerId,
        });
        setCopilotMeta(null);
      }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["messages", conversationId], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const messageOperation = useMutation({
    mutationFn: async (operation: MessageOperation) => {
      if (!conversationId) throw new Error("no conversation");
      if (operation.type === "edit") {
        return editMessage(conversationId, operation.messageId, operation.plainText);
      }
      if (operation.type === "delete") {
        return deleteMessage(conversationId, operation.messageId);
      }
      if (operation.type === "reaction.add") {
        return addMessageReaction(conversationId, operation.messageId, operation.emoji);
      }
      return removeMessageReaction(conversationId, operation.messageId, operation.emoji);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });

  const emitTyping = useCallback(() => {
    if (
      !conversationId ||
      isInternal ||
      !meta?.conversation.channelCapabilities?.includes("typing")
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastTypingAtRef.current < 4_000) return;
    lastTypingAtRef.current = now;
    void sendTyping(conversationId).catch(() => undefined);
  }, [conversationId, isInternal, meta?.conversation.channelCapabilities]);

  if (!conversationId) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
        Select a conversation to view messages
      </section>
    );
  }

  const conversation: Conversation | undefined = meta?.conversation;
  const messages = messagesData?.items ?? [];
  const templates = channelTemplates?.items ?? [];
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[hsl(var(--surface-0))]">
      <header className="border-b border-[hsl(var(--border))] px-6 py-4">
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{conversation?.subject ?? "Conversation"}</h2>
            {conversationId ? <SlaBreachBadge conversationId={conversationId} /> : null}
          </div>
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
        <ConversationActions
          key={conversationId}
          conversationId={conversationId}
          conversation={conversation}
        />
      </header>

      <VirtualMessageList
        messages={messages}
        isLoading={isLoading}
        capabilities={{
          edit: conversation?.channelCapabilities?.includes("message_edit"),
          delete: conversation?.channelCapabilities?.includes("message_delete"),
          reactions: conversation?.channelCapabilities?.includes("reactions"),
        }}
        currentActorId={meData?.member?.id ?? null}
        onEditMessage={(messageId, plainText) =>
          messageOperation.mutateAsync({ type: "edit", messageId, plainText })
        }
        onDeleteMessage={(messageId) => messageOperation.mutateAsync({ type: "delete", messageId })}
        onAddReaction={(messageId, emoji) =>
          messageOperation.mutateAsync({ type: "reaction.add", messageId, emoji })
        }
        onRemoveReaction={(messageId, emoji) =>
          messageOperation.mutateAsync({ type: "reaction.remove", messageId, emoji })
        }
      />

      <footer className="border-t border-[hsl(var(--border))] p-4">
        <label className="mb-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
          />
          Internal note (not visible to customer)
        </label>
        {isInternal ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text || send.isPending) return;
              send.mutate({ plainText: text, isInternal: true });
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Internal note…"
              className="flex-1"
            />
            <Button type="submit" disabled={send.isPending || !draft.trim()}>
              {send.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-2">
            {supportsTemplates ? (
              <WhatsAppTemplateComposer
                open={showTemplateComposer}
                loading={templatesLoading}
                pending={send.isPending}
                templates={templates}
                selectedTemplate={selectedTemplate}
                selectedTemplateId={selectedTemplateId}
                components={templateComponents}
                error={templateError}
                onToggle={() => {
                  setTemplateError(null);
                  setShowTemplateComposer((current) => !current);
                }}
                onSelect={(templateId) => {
                  setSelectedTemplateId(templateId);
                  setTemplateComponents("[]");
                  setTemplateError(null);
                }}
                onComponentsChange={setTemplateComponents}
                onSend={() => {
                  if (!selectedTemplate) return;
                  try {
                    const parsed = JSON.parse(templateComponents) as unknown;
                    if (!Array.isArray(parsed) || parsed.some((item) => !isRecord(item))) {
                      throw new Error("Template components must be a JSON array of objects.");
                    }
                    setTemplateError(null);
                    send.mutate({
                      plainText: `[WhatsApp template: ${selectedTemplate.name}]`,
                      isInternal: false,
                      directives: {
                        whatsappTemplate: {
                          name: selectedTemplate.name,
                          languageCode: selectedTemplate.language,
                          ...(parsed.length > 0
                            ? { components: parsed as Array<Record<string, unknown>> }
                            : {}),
                        },
                      },
                    });
                    setShowTemplateComposer(false);
                  } catch (error) {
                    setTemplateError(
                      error instanceof Error ? error.message : "Invalid template components.",
                    );
                  }
                }}
              />
            ) : null}
            <RichTextComposer
              key={copilotDraft?.text ?? "composer"}
              placeholder="Reply… (@ mention · / macro · ⌘Enter to send)"
              disabled={send.isPending}
              members={(membersData?.items ?? []).map((m) => ({ id: m.id, name: m.name }))}
              macros={macrosData?.items ?? []}
              externalText={copilotDraft?.text}
              onExternalTextApplied={() => {
                if (copilotDraft) {
                  setCopilotMeta({
                    providerId: copilotDraft.providerId,
                    length: copilotDraft.text.length,
                  });
                  onCopilotDraftApplied?.();
                }
              }}
              onActivity={emitTyping}
              onSubmit={(payload) => {
                send.mutate({
                  plainText: payload.plainText,
                  isInternal: false,
                  doc: payload.doc,
                  attachmentIds:
                    payload.attachmentIds.length > 0 ? payload.attachmentIds : undefined,
                });
              }}
            />
          </div>
        )}
      </footer>
    </section>
  );
}

function WhatsAppTemplateComposer({
  open,
  loading,
  pending,
  templates,
  selectedTemplate,
  selectedTemplateId,
  components,
  error,
  onToggle,
  onSelect,
  onComponentsChange,
  onSend,
}: {
  open: boolean;
  loading: boolean;
  pending: boolean;
  templates: WhatsAppTemplate[];
  selectedTemplate?: WhatsAppTemplate;
  selectedTemplateId: string;
  components: string;
  error: string | null;
  onToggle: () => void;
  onSelect: (templateId: string) => void;
  onComponentsChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="border-b border-[hsl(var(--border))] pb-2 text-xs">
      <Button type="button" variant="outline" size="sm" onClick={onToggle} disabled={loading}>
        {loading ? "Loading templates…" : "WhatsApp template"}
      </Button>
      {open ? (
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,2fr)_auto]">
          <label className="space-y-1">
            <span className="font-medium">Approved template</span>
            <select
              value={selectedTemplateId}
              onChange={(event) => onSelect(event.target.value)}
              className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-2"
            >
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.language})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1" htmlFor="whatsapp-template-components">
            <span className="font-medium">Parameters (Meta components JSON)</span>
            <Input
              id="whatsapp-template-components"
              value={components}
              onChange={(event) => onComponentsChange(event.target.value)}
              placeholder='[{"type":"body","parameters":[]}]'
              aria-invalid={Boolean(error)}
            />
          </label>
          <Button
            type="button"
            className="self-end"
            disabled={!selectedTemplate || pending}
            onClick={onSend}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send template
          </Button>
          {error ? <p className="text-red-600 md:col-span-3">{error}</p> : null}
          {!loading && templates.length === 0 ? (
            <p className="text-[hsl(var(--muted-foreground))] md:col-span-3">
              No approved templates are available for this WhatsApp number.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
