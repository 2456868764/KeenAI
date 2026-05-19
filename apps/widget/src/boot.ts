import { MessagesPanel } from "./messages-panel.js";
import {
  createWidgetSession,
  fetchWidgetMessages,
  getOrCreateWidgetConversation,
} from "./session.js";
import { createShadowHost } from "./shadow-host.js";
import type { WidgetUser } from "./types.js";
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
  const { host, mount } = createShadowHost(options.orgSlug);

  const panel = document.createElement("div");
  panel.className = "keenai-panel";
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "keenai-header";
  header.textContent = `KeenAI · ${options.orgSlug}`;

  const statusEl = document.createElement("div");
  statusEl.className = "keenai-status";
  statusEl.textContent = "Connecting…";

  const messagesMount = document.createElement("div");
  messagesMount.className = "keenai-messages-mount";

  panel.append(header, statusEl, messagesMount);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "keenai-launcher";
  launcher.setAttribute("aria-label", "Open KeenAI messenger");
  launcher.textContent = "K";

  mount.append(panel, launcher);
  document.body.appendChild(host);

  let accessToken = "";
  let conversationId = "";
  let disconnectWs: (() => void) | undefined;
  const apiUrl = options.apiUrl ?? "http://localhost:8090";

  const messages = new MessagesPanel({
    container: messagesMount,
    onSend: async (plainText) => {
      const res = await fetch(
        `${apiUrl.replace(/\/$/, "")}/api/v1/widget/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ plainText }),
        },
      );
      if (!res.ok) throw new Error("send_failed");
      const body = (await res.json()) as {
        message: { id: string; plainText: string; senderType: string; createdAt?: string };
      };
      messages.handleRealtime({ type: "message.created", message: body.message });
    },
  });

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
      messages.renderHistory(items);
      statusEl.textContent = "Connected";

      disconnectWs = connectWidgetWebSocket({
        apiUrl,
        conversationId,
        widgetToken: accessToken,
        onEvent: (event) => messages.handleRealtime(event),
        onStatus: (s) => {
          statusEl.textContent =
            s === "open" ? "Live" : s === "connecting" ? "Reconnecting…" : "Offline";
        },
      });
    } catch (e) {
      statusEl.textContent = e instanceof Error ? e.message : "Connection failed";
    }
  })();

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
