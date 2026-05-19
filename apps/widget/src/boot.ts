import {
  createWidgetSession,
  fetchWidgetMessages,
  getOrCreateWidgetConversation,
} from "./session.js";
import type { ConversationRealtimeEvent, WidgetUser } from "./types.js";
import { connectWidgetWebSocket } from "./ws-client.js";

export type KeenAIBootOptions = {
  orgSlug: string;
  brandSlug?: string;
  apiUrl?: string;
  theme?: "light" | "dark";
  user: WidgetUser;
};

export type KeenAIWidget = {
  open: () => void;
  close: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    KeenAI?: {
      boot: (options: KeenAIBootOptions) => KeenAIWidget;
    };
  }
}

export function boot(options: KeenAIBootOptions): KeenAIWidget {
  const host = document.createElement("div");
  host.setAttribute("data-keenai-widget", options.orgSlug);
  host.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483646;font-family:system-ui,sans-serif;";

  const panel = document.createElement("div");
  panel.hidden = true;
  panel.style.cssText =
    "width:360px;max-width:calc(100vw - 32px);height:480px;max-height:70vh;border-radius:12px;background:#1a1a1f;color:#f4f4f5;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;";

  const header = document.createElement("div");
  header.style.cssText = "padding:12px 16px;border-bottom:1px solid #2a2a32;font-weight:600;";
  header.textContent = `KeenAI · ${options.orgSlug}`;
  panel.appendChild(header);

  const statusEl = document.createElement("div");
  statusEl.style.cssText = "padding:4px 16px;font-size:11px;color:#a1a1aa;";
  statusEl.textContent = "Connecting…";
  panel.appendChild(statusEl);

  const messagesEl = document.createElement("div");
  messagesEl.style.cssText =
    "flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;font-size:13px;";
  panel.appendChild(messagesEl);

  const form = document.createElement("form");
  form.style.cssText = "display:flex;gap:8px;padding:12px;border-top:1px solid #2a2a32;";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message…";
  input.style.cssText =
    "flex:1;border-radius:8px;border:1px solid #3f3f46;background:#0f0f12;color:#f4f4f5;padding:8px 10px;font-size:13px;";
  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  sendBtn.style.cssText =
    "border:none;border-radius:8px;background:#7c3aed;color:#fff;padding:8px 12px;cursor:pointer;font-size:13px;";
  form.append(input, sendBtn);
  panel.appendChild(form);

  host.appendChild(panel);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open KeenAI messenger");
  launcher.style.cssText =
    "margin-top:8px;width:48px;height:48px;border-radius:9999px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-weight:700;";
  launcher.textContent = "K";
  host.appendChild(launcher);

  document.body.appendChild(host);

  let accessToken = "";
  let conversationId = "";
  let disconnectWs: (() => void) | undefined;
  const seenMessageIds = new Set<string>();

  const appendMessage = (text: string, senderType: string, messageId?: string) => {
    if (messageId) {
      if (seenMessageIds.has(messageId)) return;
      seenMessageIds.add(messageId);
    }
    const bubble = document.createElement("div");
    const isUser = senderType === "user";
    bubble.style.cssText = isUser
      ? "align-self:flex-end;max-width:85%;padding:8px 10px;border-radius:10px;background:#7c3aed;color:#fff;"
      : "align-self:flex-start;max-width:85%;padding:8px 10px;border-radius:10px;background:#27272a;color:#f4f4f5;";
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const renderMessages = (items: { id: string; plainText: string; senderType: string }[]) => {
    messagesEl.replaceChildren();
    seenMessageIds.clear();
    for (const m of items) appendMessage(m.plainText, m.senderType, m.id);
  };

  const onRealtime = (event: ConversationRealtimeEvent) => {
    if (event.type === "message.created" && event.message) {
      appendMessage(event.message.plainText, event.message.senderType, event.message.id);
    }
  };

  const apiUrl = options.apiUrl ?? "http://localhost:8090";

  void (async () => {
    try {
      const session = await createWidgetSession({
        apiUrl,
        orgSlug: options.orgSlug,
        brandSlug: options.brandSlug,
        user: options.user,
      });
      accessToken = session.accessToken;

      const { conversation } = await getOrCreateWidgetConversation({ apiUrl, accessToken });
      conversationId = conversation.id;

      const items = await fetchWidgetMessages({ apiUrl, accessToken, conversationId });
      renderMessages(items);
      statusEl.textContent = "Connected";

      disconnectWs = connectWidgetWebSocket({
        apiUrl,
        conversationId,
        widgetToken: accessToken,
        onEvent: onRealtime,
        onStatus: (s) => {
          statusEl.textContent =
            s === "open" ? "Live" : s === "connecting" ? "Reconnecting…" : "Offline";
        },
      });
    } catch (e) {
      statusEl.textContent = e instanceof Error ? e.message : "Connection failed";
    }
  })();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !accessToken || !conversationId) return;
    input.value = "";

    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/api/v1/widget/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plainText: text }),
      },
    );
    if (!res.ok) {
      statusEl.textContent = "Send failed";
      return;
    }
    const body = (await res.json()) as {
      message: { id: string; plainText: string; senderType: string };
    };
    appendMessage(body.message.plainText, body.message.senderType, body.message.id);
  });

  const toggle = () => {
    panel.hidden = !panel.hidden;
  };
  launcher.addEventListener("click", toggle);

  return {
    open: () => {
      panel.hidden = false;
    },
    close: () => {
      panel.hidden = true;
    },
    destroy: () => {
      disconnectWs?.();
      host.remove();
    },
  };
}

if (typeof window !== "undefined") {
  window.KeenAI = { boot };
}
