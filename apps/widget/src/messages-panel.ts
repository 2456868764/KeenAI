import type {
  ConversationRealtimeEvent,
  SendWidgetMessageInput,
  WidgetMessagePayload,
  WidgetWorkflowTicketFormSubmission,
} from "./types.js";

export type MessageRow = WidgetMessagePayload & { createdAt?: string };

export type MessagesPanelOptions = {
  container: HTMLElement;
  apiUrl: string;
  accessToken: string;
  onSend: (input: SendWidgetMessageInput) => Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
  onSubmitWorkflowTicketForm?: (input: WidgetWorkflowTicketFormSubmission) => Promise<void>;
  fetchAttachmentBlob: (attachmentId: string) => Promise<string>;
};

export class MessagesPanel {
  readonly #seenIds = new Set<string>();
  readonly #listEl: HTMLElement;
  readonly #form: HTMLFormElement;
  readonly #input: HTMLInputElement;
  readonly #fileInput: HTMLInputElement;
  readonly #attachBtn: HTMLButtonElement;
  readonly #sendBtn: HTMLButtonElement;
  #sending = false;
  #customerReplyDisabled = false;

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

    this.#fileInput = document.createElement("input");
    this.#fileInput.type = "file";
    this.#fileInput.accept = "image/*";
    this.#fileInput.hidden = true;

    this.#attachBtn = document.createElement("button");
    this.#attachBtn.type = "button";
    this.#attachBtn.className = "keenai-attach";
    this.#attachBtn.textContent = "📷";
    this.#attachBtn.setAttribute("aria-label", "Attach image");
    this.#attachBtn.addEventListener("click", () => this.#fileInput.click());

    this.#sendBtn = document.createElement("button");
    this.#sendBtn.type = "submit";
    this.#sendBtn.className = "keenai-send";
    this.#sendBtn.textContent = "Send";

    this.#form.append(this.#attachBtn, this.#input, this.#sendBtn);
    this.opts.container.append(this.#listEl, this.#form, this.#fileInput);

    this.#form.addEventListener("submit", (e) => void this.#onSubmit(e));
    this.#fileInput.addEventListener("change", () => void this.#onFileSelected());
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
    this.#updateComposerState();
  }

  setCustomerReplyDisabled(disabled: boolean) {
    this.#customerReplyDisabled = disabled;
    this.#updateComposerState();
  }

  #updateComposerState() {
    const disabled = this.#sending || this.#customerReplyDisabled;
    this.#input.disabled = disabled;
    this.#attachBtn.disabled = disabled;
    this.#sendBtn.disabled = disabled;
    this.#input.placeholder = this.#customerReplyDisabled
      ? "Replies are disabled"
      : "Type a message…";
    this.#sendBtn.textContent = this.#sending ? "…" : "Send";
  }

  #append(msg: MessageRow) {
    if (this.#seenIds.has(msg.id)) return;
    this.#seenIds.add(msg.id);

    const isUser = msg.senderType === "user";
    const row = document.createElement("div");
    row.className = isUser
      ? "keenai-bubble keenai-bubble--user"
      : "keenai-bubble keenai-bubble--agent";

    if (
      msg.plainText &&
      !msg.plainText.startsWith("[Image:") &&
      !msg.plainText.startsWith("[Voice")
    ) {
      const text = document.createElement("p");
      text.className = "keenai-bubble__text";
      text.textContent = msg.plainText;
      row.append(text);
    } else if (msg.plainText) {
      const text = document.createElement("p");
      text.className = "keenai-bubble__text keenai-bubble__text--muted";
      text.textContent = msg.plainText;
      row.append(text);
    }

    for (const att of msg.attachments ?? []) {
      const mime = att.contentType?.toLowerCase() ?? "";
      if (mime.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "keenai-bubble__image";
        img.alt = att.fileName ?? "image";
        void this.opts.fetchAttachmentBlob(att.id).then((url) => {
          img.src = url;
        });
        row.append(img);
        continue;
      }
      if (mime.startsWith("audio/")) {
        const audio = document.createElement("audio");
        audio.className = "keenai-bubble__audio";
        audio.controls = true;
        audio.preload = "none";
        audio.setAttribute("aria-label", "Voice message");
        void this.opts.fetchAttachmentBlob(att.id).then((url) => {
          audio.src = url;
        });
        row.append(audio);
        continue;
      }
      if (mime.startsWith("video/")) {
        const video = document.createElement("video");
        video.className = "keenai-bubble__video";
        video.controls = true;
        video.preload = "metadata";
        video.setAttribute("aria-label", att.fileName ?? "Video attachment");
        void this.opts.fetchAttachmentBlob(att.id).then((url) => {
          video.src = url;
        });
        row.append(video);
        continue;
      }

      const link = document.createElement("a");
      link.className = "keenai-bubble__file";
      link.textContent = formatAttachmentLabel(att.fileName ?? "attachment", att.sizeBytes);
      link.download = att.fileName ?? "attachment";
      link.rel = "noopener";
      void this.opts.fetchAttachmentBlob(att.id).then((url) => {
        link.href = url;
      });
      row.append(link);
    }

    const workflowTicketForm = parseWorkflowTicketForm(msg.content);
    if (workflowTicketForm) {
      row.append(this.#renderWorkflowTicketForm(workflowTicketForm));
    }

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

  #renderWorkflowTicketForm(form: WorkflowTicketForm): HTMLElement {
    const formEl = document.createElement("form");
    formEl.className = "keenai-workflow-form";

    const status = document.createElement("p");
    status.className = "keenai-inline-status";

    for (const field of form.fields) {
      const label = document.createElement("label");
      const labelText = document.createElement("span");
      labelText.textContent = field.required ? `${field.label} *` : field.label;
      label.append(labelText);

      const input = createWorkflowFieldInput(field);
      input.dataset.fieldKey = field.key;
      label.append(input);
      formEl.append(label);
    }

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "keenai-primary-button";
    submit.textContent = "Submit";
    formEl.append(submit, status);

    formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.opts.onSubmitWorkflowTicketForm) return;
      const values = readWorkflowFormValues(formEl, form.fields);
      if (!values) {
        status.textContent = "Please complete the required fields.";
        return;
      }
      submit.disabled = true;
      status.textContent = "Submitting...";
      void this.opts
        .onSubmitWorkflowTicketForm({
          workflowRunId: form.workflowRunId,
          blockId: form.blockId,
          ticketId: form.ticketId,
          values,
        })
        .then(() => {
          status.textContent = "Submitted.";
          submit.textContent = "Submitted";
        })
        .catch(() => {
          submit.disabled = false;
          status.textContent = "Could not submit form.";
        });
    });

    return formEl;
  }

  async #onSubmit(e: Event) {
    e.preventDefault();
    const text = this.#input.value.trim();
    if (!text || this.#sending || this.#customerReplyDisabled) return;
    this.#input.value = "";
    this.setSending(true);
    try {
      await this.opts.onSend({ plainText: text });
    } finally {
      this.setSending(false);
      this.#input.focus();
    }
  }

  async #onFileSelected() {
    const file = this.#fileInput.files?.[0];
    this.#fileInput.value = "";
    if (!file || this.#sending || this.#customerReplyDisabled) return;
    this.setSending(true);
    try {
      const attachmentId = await this.opts.onUploadImage(file);
      await this.opts.onSend({ attachmentIds: [attachmentId] });
    } finally {
      this.setSending(false);
    }
  }
}

function formatAttachmentLabel(fileName: string, sizeBytes: number | null | undefined): string {
  if (!sizeBytes || sizeBytes < 1) return fileName;
  if (sizeBytes < 1024) return `${fileName} · ${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${fileName} · ${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${fileName} · ${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type WorkflowTicketField = {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "date";
  required: boolean;
  options?: string[];
};

type WorkflowTicketForm = {
  workflowRunId: string;
  blockId: string;
  ticketId?: string;
  fields: WorkflowTicketField[];
};

function parseWorkflowTicketForm(
  content: Record<string, unknown> | undefined,
): WorkflowTicketForm | null {
  if (!content || content.type !== "workflow_ticket_form") return null;
  const workflow = content.workflow;
  if (!workflow || typeof workflow !== "object") return null;
  const raw = workflow as Record<string, unknown>;
  if (
    raw.kind !== "send_ticket_form" ||
    typeof raw.workflowRunId !== "string" ||
    typeof raw.blockId !== "string" ||
    !Array.isArray(raw.fields)
  ) {
    return null;
  }

  const fields = raw.fields.filter(isWorkflowTicketField);
  if (fields.length === 0) return null;
  return {
    workflowRunId: raw.workflowRunId,
    blockId: raw.blockId,
    ticketId: typeof raw.ticketId === "string" ? raw.ticketId : undefined,
    fields,
  };
}

function isWorkflowTicketField(value: unknown): value is WorkflowTicketField {
  if (!value || typeof value !== "object") return false;
  const field = value as Record<string, unknown>;
  return (
    typeof field.key === "string" &&
    typeof field.label === "string" &&
    typeof field.type === "string" &&
    ["text", "number", "boolean", "select", "date"].includes(field.type) &&
    typeof field.required === "boolean"
  );
}

function createWorkflowFieldInput(
  field: WorkflowTicketField,
): HTMLInputElement | HTMLSelectElement {
  if (field.type === "select") {
    const select = document.createElement("select");
    select.name = field.key;
    select.required = field.required;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Select...";
    select.append(empty);
    for (const option of field.options ?? []) {
      const item = document.createElement("option");
      item.value = option;
      item.textContent = option;
      select.append(item);
    }
    return select;
  }

  const input = document.createElement("input");
  input.name = field.key;
  input.required = field.required && field.type !== "boolean";
  input.type = field.type === "boolean" ? "checkbox" : field.type;
  return input;
}

function readWorkflowFormValues(
  formEl: HTMLFormElement,
  fields: WorkflowTicketField[],
): Record<string, unknown> | null {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const input = formEl.elements.namedItem(field.key) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (!input) return null;
    if (field.type === "boolean") {
      values[field.key] = (input as HTMLInputElement).checked;
      continue;
    }
    const value = input.value.trim();
    if (field.required && !value) return null;
    if (!value) continue;
    values[field.key] = field.type === "number" ? Number(value) : value;
  }
  return values;
}
