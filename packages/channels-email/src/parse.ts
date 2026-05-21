import { type ParsedMail, simpleParser } from "mailparser";
import type { ParsedInboundEmail } from "./types.js";
import { parsedInboundEmailSchema } from "./types.js";

function mailAddressEntry(entry: unknown): { address: string; name?: string } | null {
  if (!entry || typeof entry !== "object" || !("address" in entry)) return null;
  const address = entry.address;
  if (typeof address !== "string" || !address) return null;
  const name = "name" in entry && typeof entry.name === "string" ? entry.name : undefined;
  return { address, name };
}

function firstAddress(value: ParsedMail["from"]): { address: string; name?: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return mailAddressEntry(value[0]);
  }
  if ("value" in value && Array.isArray(value.value)) {
    return mailAddressEntry(value.value[0]);
  }
  return mailAddressEntry(value);
}

function listAddresses(value: ParsedMail["to"]): ParsedInboundEmail["to"] {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : "value" in value ? value.value : [value];
  return entries
    .map((entry) => mailAddressEntry(entry))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function collectReferences(mail: ParsedMail): string[] {
  const refs = new Set<string>();
  const raw = mail.references;
  if (typeof raw === "string") {
    for (const id of raw.split(/\s+/)) if (id) refs.add(id.trim());
  } else if (Array.isArray(raw)) {
    for (const id of raw) if (id) refs.add(id);
  }
  if (mail.inReplyTo) refs.add(mail.inReplyTo);
  return [...refs];
}

/** Parse raw RFC822 / MIME source into a normalized inbound email. */
export async function parseMimeSource(source: Buffer | string): Promise<ParsedInboundEmail> {
  const mail = await simpleParser(source);
  const from = firstAddress(mail.from);
  if (!from) throw new Error("missing_from");

  const plainText =
    (mail.text ?? "").trim() ||
    stripHtml(typeof mail.html === "string" ? mail.html : "") ||
    "(empty)";
  const parsed: ParsedInboundEmail = {
    messageId: mail.messageId ?? `generated-${Date.now()}@keenai.local`,
    from,
    to: listAddresses(mail.to),
    subject: mail.subject ?? "(no subject)",
    plainText,
    html: typeof mail.html === "string" ? mail.html : undefined,
    inReplyTo: mail.inReplyTo ?? undefined,
    references: collectReferences(mail),
    date: mail.date?.toISOString(),
  };

  return parsedInboundEmailSchema.parse(parsed);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
