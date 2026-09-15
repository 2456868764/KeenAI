import { useEffect, useRef } from "preact/hooks";
import { MessagesPanel } from "../messages-panel.js";
import type { WidgetConversation } from "../session.js";
import type { SendWidgetMessageInput, WidgetMessagePayload } from "../types.js";

type ChatViewProps = {
  apiUrl: string;
  accessToken: string;
  conversation: WidgetConversation | null;
  messages: WidgetMessagePayload[];
  onSend: (input: SendWidgetMessageInput) => Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
  fetchAttachmentBlob: (attachmentId: string) => Promise<string>;
};

export function ChatView({
  apiUrl,
  accessToken,
  conversation,
  messages,
  onSend,
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
      fetchAttachmentBlob,
    });
    return () => {
      mountRef.current?.replaceChildren();
      panelRef.current = null;
    };
  }, [apiUrl, accessToken, onSend, onUploadImage, fetchAttachmentBlob]);

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

  return <div ref={mountRef} className="keenai-chat-view" />;
}
