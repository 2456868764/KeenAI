import type { WidgetConversationSummary } from "../types.js";

type MessagesViewProps = {
  conversations: WidgetConversationSummary[];
  onStartChat: () => void;
  onOpenConversation: (conversationId: string) => void;
};

export function MessagesView({
  conversations,
  onStartChat,
  onOpenConversation,
}: MessagesViewProps) {
  if (conversations.length === 0) {
    return (
      <div className="keenai-empty-state">
        <h2>No messages yet</h2>
        <p>Start a conversation with the team.</p>
        <button type="button" className="keenai-primary-button" onClick={onStartChat}>
          Ask a question
        </button>
      </div>
    );
  }

  return (
    <div className="keenai-list">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          className="keenai-conversation-row"
          onClick={() => onOpenConversation(conversation.id)}
        >
          <span>
            <strong>{conversation.subject ?? "Conversation"}</strong>
            <small>{conversation.lastMessagePreview ?? "No messages yet"}</small>
          </span>
          <time>{formatTime(conversation.lastMessageCreatedAt)}</time>
        </button>
      ))}
    </div>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
