import { parseMimeSource } from "./parse.js";
import type { ParsedInboundEmail } from "./types.js";

/** Generic raw MIME POST body (manual / SES raw delivery). */
export async function adaptRawMimeBody(body: Buffer | string): Promise<ParsedInboundEmail> {
  return parseMimeSource(body);
}

/** AWS SES via SNS notification (simplified JSON; production should verify SNS signature). */
export async function adaptSesNotification(payload: unknown): Promise<ParsedInboundEmail> {
  const record = payload as {
    Message?: string;
    message?: { content?: string };
    content?: string;
  };

  let inner: { content?: string; mail?: { messageId?: string } } | string | undefined;
  if (typeof record.Message === "string") {
    try {
      inner = JSON.parse(record.Message) as { content?: string };
    } catch {
      inner = undefined;
    }
  } else {
    inner = record.message ?? record;
  }

  const content =
    typeof inner === "string"
      ? inner
      : inner && typeof inner === "object" && "content" in inner
        ? inner.content
        : undefined;

  if (!content) throw new Error("ses_missing_content");
  return parseMimeSource(content);
}

/** SendGrid Inbound Parse (multipart fields; pass parsed form object). */
export async function adaptSendGridInbound(form: {
  email?: string;
  raw?: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
}): Promise<ParsedInboundEmail> {
  if (form.raw) return parseMimeSource(form.raw);
  if (form.email) return parseMimeSource(form.email);

  const messageId = extractHeader(form.headers, "Message-ID") ?? `sg-${Date.now()}@sendgrid.local`;
  const inReplyTo = extractHeader(form.headers, "In-Reply-To");
  const references = extractReferences(form.headers);

  return {
    messageId,
    from: parseFromHeader(form.from ?? "unknown@invalid"),
    to: [],
    subject: form.subject ?? "(no subject)",
    plainText: form.text ?? stripHtml(form.html ?? "") ?? "(empty)",
    html: form.html,
    inReplyTo,
    references,
    date: new Date().toISOString(),
  };
}

/** Mailgun Routes forward (form fields). */
export async function adaptMailgunInbound(form: {
  "body-mime"?: string;
  "stripped-text"?: string;
  "stripped-html"?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  "Message-Id"?: string;
  "In-Reply-To"?: string;
  References?: string;
}): Promise<ParsedInboundEmail> {
  if (form["body-mime"]) return parseMimeSource(form["body-mime"]);

  const messageId = form["Message-Id"] ?? `mg-${Date.now()}@mailgun.local`;
  const references = form.References
    ? form.References.split(/\s+/).filter(Boolean)
    : form["In-Reply-To"]
      ? [form["In-Reply-To"]]
      : [];

  return {
    messageId,
    from: parseFromHeader(form.sender ?? "unknown@invalid"),
    to: form.recipient ? [{ address: form.recipient }] : [],
    subject: form.subject ?? "(no subject)",
    plainText: form["stripped-text"] ?? stripHtml(form["stripped-html"] ?? "") ?? "(empty)",
    html: form["stripped-html"],
    inReplyTo: form["In-Reply-To"],
    references,
    date: new Date().toISOString(),
  };
}

function extractHeader(headers: string | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const m = headers.match(re);
  return m?.[1]?.trim();
}

function extractReferences(headers: string | undefined): string[] {
  const line = extractHeader(headers, "References");
  if (!line) return [];
  return line.split(/\s+/).filter(Boolean);
}

function parseFromHeader(raw: string): ParsedInboundEmail["from"] {
  const m = /^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/.exec(raw.trim());
  const address = m?.[2] ?? raw.trim();
  return { address, name: m?.[1]?.trim() || undefined };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
