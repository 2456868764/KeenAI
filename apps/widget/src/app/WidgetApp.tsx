import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { KeenAIBootOptions } from "../boot.js";
import { Launcher } from "../components/Launcher.js";
import { WidgetShell } from "../components/WidgetShell.js";
import {
  type WidgetConversation,
  type WidgetMessage,
  createWidgetSession,
  fetchWidgetAttachmentBlob,
  fetchWidgetConfig,
  fetchWidgetConversations,
  fetchWidgetMessages,
  getOrCreateWidgetConversation,
  postWidgetMessage,
  uploadWidgetImage,
} from "../session.js";
import type {
  ConversationRealtimeEvent,
  SendWidgetMessageInput,
  WidgetConfig,
  WidgetConversationSummary,
} from "../types.js";
import { ChangelogView } from "../views/ChangelogView.js";
import { ChatView } from "../views/ChatView.js";
import { HelpView } from "../views/HelpView.js";
import { HomeView } from "../views/HomeView.js";
import { MessagesView } from "../views/MessagesView.js";
import { connectWidgetWebSocket } from "../ws-client.js";
import type { WidgetView } from "./routes.js";

type WidgetAppProps = {
  options: KeenAIBootOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WidgetApp({ options, open, onOpenChange }: WidgetAppProps) {
  const apiUrl = useMemo(() => options.apiUrl ?? "http://localhost:8090", [options.apiUrl]);
  const [view, setView] = useState<WidgetView>("home");
  const [status, setStatus] = useState("Connecting...");
  const [accessToken, setAccessToken] = useState("");
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [activeConversation, setActiveConversation] = useState<WidgetConversation | null>(null);
  const [conversations, setConversations] = useState<WidgetConversationSummary[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, WidgetMessage[]>
  >({});

  const activeConversationId = activeConversation?.id ?? "";
  const activeMessages = activeConversationId
    ? (messagesByConversation[activeConversationId] ?? [])
    : [];

  const appendMessage = useCallback((conversationId: string, message: WidgetMessage) => {
    setMessagesByConversation((current) => {
      const messages = current[conversationId] ?? [];
      if (messages.some((item) => item.id === message.id)) return current;
      return { ...current, [conversationId]: [...messages, message] };
    });
  }, []);

  const refreshConversations = useCallback(
    async (token: string) => {
      const items = await fetchWidgetConversations({ apiUrl, accessToken: token });
      setConversations(items);
    },
    [apiUrl],
  );

  const loadConversationMessages = useCallback(
    async (token: string, conversationId: string) => {
      const items = await fetchWidgetMessages({ apiUrl, accessToken: token, conversationId });
      setMessagesByConversation((current) => ({ ...current, [conversationId]: items }));
    },
    [apiUrl],
  );

  const startChat = useCallback(async () => {
    if (!accessToken) return;
    setView("chat");
    const { conversation } = await getOrCreateWidgetConversation({ apiUrl, accessToken });
    setActiveConversation(conversation);
    await loadConversationMessages(accessToken, conversation.id);
    await refreshConversations(accessToken);
  }, [accessToken, apiUrl, loadConversationMessages, refreshConversations]);

  const openConversation = useCallback(
    async (conversationId: string) => {
      if (!accessToken) return;
      const summary = conversations.find((item) => item.id === conversationId);
      setActiveConversation({
        id: conversationId,
        status: summary?.status ?? "open",
        subject: summary?.subject ?? null,
        customerReplyDisabled: summary?.customerReplyDisabled,
      });
      setView("chat");
      if (!messagesByConversation[conversationId]) {
        await loadConversationMessages(accessToken, conversationId);
      }
    },
    [accessToken, conversations, loadConversationMessages, messagesByConversation],
  );

  const sendMessage = useCallback(
    async (input: SendWidgetMessageInput) => {
      if (!accessToken || !activeConversationId) return;
      const message = await postWidgetMessage({
        apiUrl,
        accessToken,
        conversationId: activeConversationId,
        plainText: input.plainText,
        attachmentIds: input.attachmentIds,
      });
      appendMessage(activeConversationId, message);
      await refreshConversations(accessToken);
    },
    [accessToken, activeConversationId, apiUrl, appendMessage, refreshConversations],
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (!accessToken) throw new Error("not_connected");
      const result = await uploadWidgetImage({ apiUrl, accessToken, file });
      return result.attachmentId;
    },
    [accessToken, apiUrl],
  );

  const fetchAttachmentBlob = useCallback(
    async (attachmentId: string) => {
      if (!accessToken) throw new Error("not_connected");
      return fetchWidgetAttachmentBlob({ apiUrl, accessToken, attachmentId });
    },
    [accessToken, apiUrl],
  );

  useEffect(() => {
    let cancelled = false;
    let disconnectWs: (() => void) | undefined;

    async function connect() {
      try {
        setStatus("Connecting...");
        const session = await createWidgetSession({
          apiUrl,
          orgSlug: options.orgSlug,
          brandSlug: options.brandSlug,
          user: options.user,
        });
        if (cancelled) return;
        setAccessToken(session.accessToken);

        const [nextConfig, conversation] = await Promise.all([
          fetchWidgetConfig({ apiUrl, accessToken: session.accessToken }),
          getOrCreateWidgetConversation({ apiUrl, accessToken: session.accessToken }),
        ]);
        if (cancelled) return;

        setConfig(nextConfig);
        setActiveConversation(conversation.conversation);
        await Promise.all([
          loadConversationMessages(session.accessToken, conversation.conversation.id),
          refreshConversations(session.accessToken),
        ]);
        if (cancelled) return;

        setStatus("Connected");
        disconnectWs = connectWidgetWebSocket({
          apiUrl,
          conversationId: conversation.conversation.id,
          widgetToken: session.accessToken,
          onEvent: (event: ConversationRealtimeEvent) => {
            if (event.type === "message.created" && event.message && event.conversationId) {
              appendMessage(event.conversationId, event.message as WidgetMessage);
              void refreshConversations(session.accessToken);
            }
          },
          onStatus: (nextStatus) => {
            setStatus(
              nextStatus === "open"
                ? "Live"
                : nextStatus === "connecting"
                  ? "Reconnecting..."
                  : "Offline",
            );
          },
        });
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : "Connection failed");
      }
    }

    void connect();

    return () => {
      cancelled = true;
      disconnectWs?.();
    };
  }, [
    apiUrl,
    appendMessage,
    loadConversationMessages,
    options.brandSlug,
    options.orgSlug,
    options.user,
    refreshConversations,
  ]);

  const shellTitle =
    view === "chat" ? (config?.agent.name ?? "Keeni AI Agent") : (config?.brand.name ?? "KeenAI");
  const shellSubtitle = view === "chat" ? config?.agent.subtitle : undefined;

  return (
    <>
      <WidgetShell
        open={open}
        view={view}
        title={shellTitle}
        subtitle={shellSubtitle}
        config={config}
        status={status}
        showBack={view === "chat"}
        onBack={() => setView("messages")}
        onViewChange={setView}
      >
        {view === "home" ? <HomeView config={config} onStartChat={startChat} /> : null}
        {view === "messages" ? (
          <MessagesView
            conversations={conversations}
            onStartChat={startChat}
            onOpenConversation={openConversation}
          />
        ) : null}
        {view === "chat" ? (
          <ChatView
            apiUrl={apiUrl}
            accessToken={accessToken}
            conversation={activeConversation}
            messages={activeMessages}
            onSend={sendMessage}
            onUploadImage={uploadImage}
            fetchAttachmentBlob={fetchAttachmentBlob}
          />
        ) : null}
        {view === "help" ? <HelpView onStartChat={startChat} /> : null}
        {view === "changelog" ? <ChangelogView /> : null}
      </WidgetShell>
      <Launcher
        open={open}
        label={config?.brand.name?.charAt(0).toUpperCase() || "K"}
        onClick={() => onOpenChange(!open)}
      />
    </>
  );
}
