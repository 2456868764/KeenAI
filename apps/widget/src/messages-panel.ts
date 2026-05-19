import type { ConversationRealtimeEvent, WidgetMessagePayload } from "./types.js";

export type MessageRow = WidgetMessagePayload & { createdAt?: string };

export type MessagesPanelOptions = {
  container: HTMLElement;
  onSend: (plainText: string) => Promise<void>;
};

export class MessagesPanel {
  readonly #seenIds = new Set<string>();
  readonly #listEl: HTMLElement;
  readonly #form: HTMLFormElement;
  readonly #input: HTMLInputElement;
  readonly #sendBtn: HTMLButtonElement;
  #sending = false;

  constructor(private readonly opts: MessagesPanelOptions) {
    this.#listEl = document.createElement("div");
    this.#listEl.className = "keenai-messages";
    this.#listEl.setAttribute("role", "log");
    this.#listEl.setAttribute("aria-live", "polite");

    this.#form = document.createElement("form");
    this.#form.className = "keenai-compose";

    this.#input = document.createElement("input");
    this.#input.type = "text";
    this.#input.className = "keenai-input";
    this.#input.placeholder = "Type a message…";
    this.#input.setAttribute("aria-label", "Message");

    this.#sendBtn = document.createElement("button");
    this.#sendBtn.type = "submit";
    this.#sendBtn.className = "keenai-send";
    this.#sendBtn.textContent = "Send";

    this.#form.append(this.#input, this.#sendBtn);
    this.opts.container.append(this.#listEl, this.#form);

    this.#form.addEventListener("submit", (e) => void this.#onSubmit(e));
  }

  renderHistory(items: MessageRow[]) {
    this.#listEl.replaceChildren();
    this.#seenIds.clear();
    for (const m of items) this.#append(m);
  }

  handleRealtime(event: ConversationRealtimeEvent) {
    if (event.type === "message.created" && event.message) {
      this.#append(event.message);
    }
  }

  setSending(sending: boolean) {
    this.#sending = sending;
    this.#input.disabled = sending;
    this.#sendBtn.disabled = sending;
    this.#sendBtn.textContent = sending ? "…" : "Send";
  }

  #append(msg: MessageRow) {
    if (this.#seenIds.has(msg.id)) return;
    this.#seenIds.add(msg.id);

    const isUser = msg.senderType === "user";
    const row = document.createElement("div");
    row.className = isUser
      ? "keenai-bubble keenai-bubble--user"
      : "keenai-bubble keenai-bubble--agent";

    const text = document.createElement("p");
    text.className = "keenai-bubble__text";
    text.textContent = msg.plainText;

    row.append(text);
    if (msg.createdAt) {
      const time = document.createElement("time");
      time.className = "keenai-bubble__time";
      time.dateTime = msg.createdAt;
      time.textContent = formatTime(msg.createdAt);
      row.append(time);
    }

    this.#listEl.append(row);
    this.#listEl.scrollTop = this.#listEl.scrollHeight;
  }

  async #onSubmit(e: Event) {
    e.preventDefault();
    const text = this.#input.value.trim();
    if (!text || this.#sending) return;
    this.#input.value = "";
    this.setSending(true);
    try {
      await this.opts.onSend(text);
    } finally {
      this.setSending(false);
      this.#input.focus();
    }
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
