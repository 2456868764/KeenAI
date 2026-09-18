import { useEffect, useRef } from "preact/hooks";
import { MessagesPanel } from "../messages-panel.js";
import type { WidgetConversation } from "../session.js";
import type {
  SendWidgetMessageInput,
  WidgetAnswerState,
  WidgetMessagePayload,
  WidgetWorkflowTicketFormSubmission,
} from "../types.js";

type ChatViewProps = {
  apiUrl: string;
  accessToken: string;
  conversation: WidgetConversation | null;
  messages: WidgetMessagePayload[];
  answerState: WidgetAnswerState;
  handoffRequested: boolean;
  allowHandoff?: boolean;
  onSend: (input: SendWidgetMessageInput) => Promise<void>;
  onRequestHandoff: () => Promise<void>;
  onSubmitWorkflowTicketForm: (input: WidgetWorkflowTicketFormSubmission) => Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
  fetchAttachmentBlob: (attachmentId: string) => Promise<string>;
};

export function ChatView({
  apiUrl,
  accessToken,
  conversation,
  messages,
  answerState,
  handoffRequested,
  allowHandoff = true,
  onSend,
  onRequestHandoff,
  onSubmitWorkflowTicketForm,
  onUploadImage,
  fetchAttachmentBlob,
}: ChatViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<MessagesPanel | null>(null);

  useEffect(() => {
    if (!mountRef.current || panelRef.current) return;
    panelRef.current = new MessagesPanel({
      container: mountRef.current,
      apiUrl,
      accessToken,
      onSend,
      onUploadImage,
      onSubmitWorkflowTicketForm,
      fetchAttachmentBlob,
    });
    return () => {
      mountRef.current?.replaceChildren();
      panelRef.current = null;
    };
  }, [apiUrl, accessToken, onSend, onUploadImage, onSubmitWorkflowTicketForm, fetchAttachmentBlob]);

  useEffect(() => {
    panelRef.current?.renderHistory(messages);
  }, [messages]);

  useEffect(() => {
    panelRef.current?.setCustomerReplyDisabled(conversation?.customerReplyDisabled ?? false);
  }, [conversation?.customerReplyDisabled]);

  if (!conversation) {
    return (
      <div className="keenai-empty-state">
        <h2>Starting chat</h2>
        <p>Preparing your conversation.</p>
      </div>
    );
  }

  return (
    <div className="keenai-chat-layout">
      <div ref={mountRef} className="keenai-chat-view" />
      {answerState.status !== "idle" ? (
        <AnswerStatus
          state={answerState}
          handoffRequested={handoffRequested}
          allowHandoff={allowHandoff}
          onRequestHandoff={onRequestHandoff}
        />
      ) : null}
    </div>
  );
}

function AnswerStatus({
  state,
  handoffRequested,
  allowHandoff,
  onRequestHandoff,
}: {
  state: WidgetAnswerState;
  handoffRequested: boolean;
  allowHandoff: boolean;
  onRequestHandoff: () => Promise<void>;
}) {
  const title =
    state.status === "error"
      ? "AI answer unavailable"
      : state.status === "done"
        ? "AI answer"
        : state.status === "searching"
          ? "Searching knowledge base"
          : "AI is answering";

  return (
    <section className={`keenai-answer-status keenai-answer-status--${state.status}`}>
      <strong>{title}</strong>
      {state.error ? <p className="keenai-answer-status__error">{state.error}</p> : null}
      {state.text ? <p className="keenai-answer-status__text">{state.text}</p> : null}
      {state.citations.length > 0 ? (
        <div className="keenai-answer-citations" aria-label="Answer sources">
          {state.citations.map((citation) => (
            <span className="keenai-answer-citation" key={citation.chunkId}>
              {citation.documentTitle}
            </span>
          ))}
        </div>
      ) : null}
      {allowHandoff ? (
        <button
          className="keenai-answer-handoff"
          disabled={handoffRequested}
          type="button"
          onClick={() => void onRequestHandoff()}
        >
          {handoffRequested ? "Team notified" : "Contact support"}
        </button>
      ) : null}
    </section>
  );
}
