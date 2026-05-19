import { type ParsedMail, simpleParser } from "mailparser";
import type { ParsedInboundEmail } from "./types.js";
import { parsedInboundEmailSchema } from "./types.js";

function firstAddress(value: ParsedMail["from"]): { address: string; name?: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const v = value[0];
    if (v && "address" in v && v.address) return { address: v.address, name: v.name };
    return null;
  }
  if ("value" in value && Array.isArray(value.value) && value.value[0]?.address) {
    return { address: value.value[0].address, name: value.value[0].name };
  }
  if ("address" in value && value.address) {
    return { address: value.address, name: "name" in value ? value.name : undefined };
  }
  return null;
}

function listAddresses(value: ParsedMail["to"]): ParsedInboundEmail["to"] {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : "value" in value ? value.value : [value];
  return entries
    .map((e) => {
      if (e && typeof e === "object" && "address" in e && e.address) {
        return { address: e.address, name: "name" in e ? e.name : undefined };
      }
      return null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
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

  const plainText = (mail.text ?? "").trim() || stripHtml(mail.html ?? "") || "(empty)";
  const parsed: ParsedInboundEmail = {
    messageId: mail.messageId ?? `generated-${Date.now()}@keenai.local`,
    from,
    to: listAddresses(mail.to),
    subject: mail.subject ?? "(no subject)",
    plainText,
    html: mail.html ? String(mail.html) : undefined,
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
