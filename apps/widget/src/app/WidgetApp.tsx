import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { KeenAIBootOptions } from "../boot.js";
import { Launcher } from "../components/Launcher.js";
import { WidgetShell } from "../components/WidgetShell.js";
import {
  type WidgetConversation,
  type WidgetMessage,
  createWidgetSession,
  createWidgetTicket,
  fetchWidgetAttachmentBlob,
  fetchWidgetChangelogEntries,
  fetchWidgetChangelogEntry,
  fetchWidgetConfig,
  fetchWidgetConversations,
  fetchWidgetHelpArticle,
  fetchWidgetHelpArticles,
  fetchWidgetHelpCollections,
  fetchWidgetHome,
  fetchWidgetMessages,
  getOrCreateWidgetConversation,
  postWidgetMessage,
  requestWidgetHandoff,
  streamWidgetAnswer,
  submitWidgetWorkflowTicketForm,
  uploadWidgetImage,
} from "../session.js";
import type {
  ConversationRealtimeEvent,
  SendWidgetMessageInput,
  WidgetAnswerState,
  WidgetChangelogEntry,
  WidgetConfig,
  WidgetConversationSummary,
  WidgetHelpArticle,
  WidgetHelpCollection,
  WidgetHome,
  WidgetWorkflowTicketFormSubmission,
} from "../types.js";
import { ChangelogView } from "../views/ChangelogView.js";
import { ChatView } from "../views/ChatView.js";
import { HelpView } from "../views/HelpView.js";
import { HomeView } from "../views/HomeView.js";
import { MessagesView } from "../views/MessagesView.js";
import { TicketView } from "../views/TicketView.js";
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
  const [home, setHome] = useState<WidgetHome | null>(null);
  const [helpCollections, setHelpCollections] = useState<WidgetHelpCollection[]>([]);
  const [helpArticles, setHelpArticles] = useState<WidgetHelpArticle[]>([]);
  const [changelogEntries, setChangelogEntries] = useState<WidgetChangelogEntry[]>([]);
  const [activeConversation, setActiveConversation] = useState<WidgetConversation | null>(null);
  const [ticketType, setTicketType] = useState("support");
  const [conversations, setConversations] = useState<WidgetConversationSummary[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, WidgetMessage[]>
  >({});
  const [answerState, setAnswerState] = useState<WidgetAnswerState>({
    status: "idle",
    text: "",
    citations: [],
  });
  const [handoffRequested, setHandoffRequested] = useState(false);

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
    setAnswerState({ status: "idle", text: "", citations: [] });
    setHandoffRequested(false);
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
      setAnswerState({ status: "idle", text: "", citations: [] });
      setHandoffRequested(false);
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
      const query = input.plainText?.trim();
      if (query && (!input.attachmentIds || input.attachmentIds.length === 0)) {
        setHandoffRequested(false);
        setAnswerState({ status: "searching", text: "", citations: [] });
        try {
          await streamWidgetAnswer(
            {
              apiUrl,
              accessToken,
              conversationId: activeConversationId,
              query,
            },
            {
              onSearching: () => {
                setAnswerState((current) => ({ ...current, status: "searching" }));
              },
              onMeta: (meta) => {
                setAnswerState((current) => ({
                  ...current,
                  citations: meta.citations,
                }));
              },
              onTextDelta: (text) => {
                setAnswerState((current) => ({
                  ...current,
                  status: "streaming",
                  text: `${current.text}${text}`,
                }));
              },
              onDone: () => {
                setAnswerState((current) => ({ ...current, status: "done" }));
              },
            },
          );
        } catch (error) {
          setAnswerState({
            status: "error",
            text: "",
            citations: [],
            error: error instanceof Error ? error.message : "answer_failed",
          });
        } finally {
          await loadConversationMessages(accessToken, activeConversationId);
          await refreshConversations(accessToken);
        }
        return;
      }

      setAnswerState({ status: "idle", text: "", citations: [] });
      setHandoffRequested(false);
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
    [
      accessToken,
      activeConversationId,
      apiUrl,
      appendMessage,
      loadConversationMessages,
      refreshConversations,
    ],
  );

  const requestHandoff = useCallback(async () => {
    if (!accessToken || !activeConversationId || handoffRequested) return;
    const result = await requestWidgetHandoff({
      apiUrl,
      accessToken,
      conversationId: activeConversationId,
    });
    setActiveConversation(result.conversation);
    appendMessage(activeConversationId, result.message);
    setHandoffRequested(true);
    setAnswerState({
      status: "done",
      text: "A teammate will follow up here.",
      citations: [],
    });
    await loadConversationMessages(accessToken, activeConversationId);
    await refreshConversations(accessToken);
  }, [
    accessToken,
    activeConversationId,
    apiUrl,
    appendMessage,
    handoffRequested,
    loadConversationMessages,
    refreshConversations,
  ]);

  const submitWorkflowTicketForm = useCallback(
    async (submission: WidgetWorkflowTicketFormSubmission) => {
      if (!accessToken || !activeConversationId) return;
      await submitWidgetWorkflowTicketForm({
        apiUrl,
        accessToken,
        conversationId: activeConversationId,
        submission,
      });
      await loadConversationMessages(accessToken, activeConversationId);
      await refreshConversations(accessToken);
    },
    [accessToken, activeConversationId, apiUrl, loadConversationMessages, refreshConversations],
  );

  const openTicketForm = useCallback((type: string) => {
    setTicketType(type);
    setView("ticket");
  }, []);

  const submitTicket = useCallback(
    async (input: {
      type: string;
      title: string;
      description: string;
      attachmentIds?: string[];
    }) => {
      if (!accessToken) return;
      const result = await createWidgetTicket({
        apiUrl,
        accessToken,
        type: input.type,
        title: input.title,
        description: input.description,
        attachmentIds: input.attachmentIds,
      });
      setActiveConversation(result.conversation);
      await refreshConversations(accessToken);
    },
    [accessToken, apiUrl, refreshConversations],
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

        const [nextConfig, nextHome, conversation] = await Promise.all([
          fetchWidgetConfig({ apiUrl, accessToken: session.accessToken }),
          fetchWidgetHome({ apiUrl, accessToken: session.accessToken }),
          getOrCreateWidgetConversation({ apiUrl, accessToken: session.accessToken }),
        ]);
        if (cancelled) return;

        setConfig(nextConfig);
        setHome(nextHome);
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

  useEffect(() => {
    if (!accessToken || view !== "help" || helpCollections.length > 0 || helpArticles.length > 0) {
      return;
    }

    let cancelled = false;
    async function loadHelp() {
      const [collections, articles] = await Promise.all([
        fetchWidgetHelpCollections({ apiUrl, accessToken }),
        fetchWidgetHelpArticles({ apiUrl, accessToken }),
      ]);
      if (cancelled) return;
      setHelpCollections(collections);
      setHelpArticles(articles);
    }

    void loadHelp();
    return () => {
      cancelled = true;
    };
  }, [accessToken, apiUrl, helpArticles.length, helpCollections.length, view]);

  useEffect(() => {
    if (!accessToken || view !== "changelog" || changelogEntries.length > 0) return;

    let cancelled = false;
    async function loadChangelog() {
      const entries = await fetchWidgetChangelogEntries({ apiUrl, accessToken });
      if (!cancelled) setChangelogEntries(entries);
    }

    void loadChangelog();
    return () => {
      cancelled = true;
    };
  }, [accessToken, apiUrl, changelogEntries.length, view]);

  const shellTitle =
    view === "chat"
      ? (config?.agent.name ?? "Keeni AI Agent")
      : view === "ticket"
        ? "Submit ticket"
        : (config?.brand.name ?? "KeenAI");
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
        showBack={view === "chat" || view === "ticket"}
        onBack={() => setView(view === "ticket" ? "home" : "messages")}
        onViewChange={setView}
      >
        {view === "home" ? (
          <HomeView
            config={config}
            home={home}
            onStartChat={startChat}
            onSubmitTicket={openTicketForm}
          />
        ) : null}
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
            answerState={answerState}
            handoffRequested={handoffRequested}
            onSend={sendMessage}
            onRequestHandoff={requestHandoff}
            onSubmitWorkflowTicketForm={submitWorkflowTicketForm}
            onUploadImage={uploadImage}
            fetchAttachmentBlob={fetchAttachmentBlob}
          />
        ) : null}
        {view === "help" ? (
          <HelpView
            collections={helpCollections}
            articles={helpArticles}
            onLoadArticle={(articleId) => {
              if (!accessToken) throw new Error("not_connected");
              return fetchWidgetHelpArticle({ apiUrl, accessToken, articleId });
            }}
            onStartChat={startChat}
          />
        ) : null}
        {view === "changelog" ? (
          <ChangelogView
            entries={changelogEntries}
            onLoadEntry={(slug) => {
              if (!accessToken) throw new Error("not_connected");
              return fetchWidgetChangelogEntry({ apiUrl, accessToken, slug });
            }}
          />
        ) : null}
        {view === "ticket" ? (
          <TicketView type={ticketType} onSubmit={submitTicket} onUploadFile={uploadImage} />
        ) : null}
      </WidgetShell>
      <Launcher
        open={open}
        label={config?.brand.name?.charAt(0).toUpperCase() || "K"}
        onClick={() => onOpenChange(!open)}
      />
    </>
  );
}
