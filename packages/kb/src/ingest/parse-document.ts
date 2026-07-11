import { inflateRawSync } from "node:zlib";

export type ParsedKbDocument = {
  title: string;
  plainText: string;
  sections: Array<{
    id: string;
    heading: string;
    body: string;
    level?: number;
    path?: string[];
    pageNumber?: number;
    blockType?: "heading" | "paragraph" | "table" | "list" | "code" | "figure" | "text";
    metadata?: Record<string, unknown>;
  }>;
  parserProvider?: string;
  metadata?: Record<string, unknown>;
};

export type ParseKbDocumentInput = {
  title: string;
  rawContent: string;
  contentType?: string | null;
  url?: string | null;
  fileName?: string | null;
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToMarkdownish(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, body: string) => {
      const text = stripInlineMarkup(body);
      return `\n${"#".repeat(Number(level))} ${text}\n`;
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body: string) => `\n- ${stripInlineMarkup(body)}`)
    .replace(/<\/(p|div|section|article|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function stripInlineMarkup(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function normalizeMarkdown(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/^```[^\n]*\n?/, "")
        .replace(/```$/, "")
        .trim(),
    )
    .replace(/\t/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentTypeIncludes(contentType: string | null | undefined, token: string): boolean {
  return contentType?.toLowerCase().includes(token) ?? false;
}

function decodePayloadBytes(raw: string): Buffer {
  const dataUrl = /^data:[^;]+;base64,(.+)$/s.exec(raw.trim());
  if (dataUrl?.[1]) return Buffer.from(dataUrl[1].replace(/\s+/g, ""), "base64");

  const compact = raw.replace(/\s+/g, "");
  if (compact.length > 0 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    const decoded = Buffer.from(compact, "base64");
    if (
      decoded.subarray(0, 4).toString("latin1") === "%PDF" ||
      decoded.subarray(0, 2).toString("latin1") === "PK" ||
      decoded.toString("utf8", 0, Math.min(decoded.length, 256)).includes("<w:document")
    ) {
      return decoded;
    }
  }

  return Buffer.from(raw, "latin1");
}

function decodePdfLiteral(value: string): string {
  return value.replace(/\\([nrtbf\\()])|\\([0-7]{1,3})/g, (_match, escaped, octal) => {
    if (octal) return String.fromCharCode(Number.parseInt(octal, 8));
    switch (escaped) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      default:
        return escaped ?? "";
    }
  });
}

function decodePdfHex(value: string): string {
  const clean = value.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length - 1; i += 2) {
    const byte = Number.parseInt(clean.slice(i, i + 2), 16);
    if (Number.isFinite(byte)) bytes.push(byte);
  }
  return Buffer.from(bytes).toString("utf8").replace(/\0/g, "");
}

function extractPdfText(raw: string): string {
  const bytes = decodePayloadBytes(raw);
  const body = bytes.toString("latin1");
  const chunks: string[] = [];

  for (const match of body.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)) {
    const arrayBody = match[1] ?? "";
    for (const literal of arrayBody.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      chunks.push(decodePdfLiteral(literal[0].slice(1, -1)));
    }
    for (const hex of arrayBody.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
      chunks.push(decodePdfHex(hex[1] ?? ""));
    }
  }

  for (const match of body.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    chunks.push(decodePdfLiteral(match[0].replace(/\s*Tj$/, "").slice(1, -1)));
  }

  for (const match of body.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
    chunks.push(decodePdfHex(match[1] ?? ""));
  }

  const extracted = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (extracted) return extracted;

  return body
    .split(/[^ -~\n\r\t]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && /[A-Za-z0-9]/.test(part))
    .join("\n");
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function extractWordXmlText(xml: string): string {
  const normalized = xml
    .replace(/<w:(tab|br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n");
  return [...normalized.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlEntities(match[1] ?? ""))
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compression = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const fileNameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    const name = bytes.toString("utf8", nameStart, nameStart + fileNameLength);
    const payload = bytes.subarray(dataStart, dataEnd);
    if (compression === 0) entries.set(name, Buffer.from(payload));
    if (compression === 8) entries.set(name, inflateRawSync(payload));
    offset = dataEnd;
  }

  return entries;
}

function extractDocxText(raw: string): string {
  const bytes = decodePayloadBytes(raw);
  const rawXml = bytes.toString("utf8");
  if (rawXml.includes("<w:document")) return extractWordXmlText(rawXml);

  const documentXml = readZipEntries(bytes).get("word/document.xml");
  if (!documentXml) return rawXml.trim();
  return extractWordXmlText(documentXml.toString("utf8"));
}

function normalizeRawContent(input: ParseKbDocumentInput): string {
  if (contentTypeIncludes(input.contentType, "pdf")) return extractPdfText(input.rawContent);
  if (
    contentTypeIncludes(input.contentType, "docx") ||
    contentTypeIncludes(input.contentType, "wordprocessingml")
  ) {
    return extractDocxText(input.rawContent);
  }
  return input.rawContent;
}

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || "section";
}

function uniqueId(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function cleanBody(lines: string[]): string {
  return lines
    .join("\n")
    .split("\n")
    .map((line) => stripInlineMarkup(line.replace(/^\s{0,3}[-*+]\s+/, "- ")))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normalize markdown/HTML KB raw content into heading-aware plain sections. */
export function parseKbDocument(input: ParseKbDocumentInput): ParsedKbDocument {
  const rawContent = normalizeRawContent(input);
  const source =
    contentTypeIncludes(input.contentType, "html") || /<\/?[a-z][\s\S]*>/i.test(rawContent)
      ? htmlToMarkdownish(rawContent)
      : rawContent;
  const normalized = normalizeMarkdown(source);
  const sections: ParsedKbDocument["sections"] = [];
  const seenIds = new Map<string, number>();
  const headingStack: Array<{ level: number; heading: string }> = [];
  let current: { level: number; heading: string; lines: string[] } | null = null;

  const pushCurrent = () => {
    const active = current;
    if (!active) return;
    const body = cleanBody(active.lines);
    if (!body) return;

    while (headingStack.length) {
      const parent = headingStack.at(-1);
      if (!parent || parent.level < active.level) break;
      headingStack.pop();
    }
    headingStack.push({ level: active.level, heading: active.heading });

    const path = headingStack.map((item) => item.heading);
    sections.push({
      id: uniqueId(slugify(path.join("-")), seenIds),
      heading: active.heading,
      body,
      level: active.level,
      path,
    });
  };

  for (const line of normalized.split("\n")) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      pushCurrent();
      current = {
        level: heading[1]?.length ?? 1,
        heading: stripInlineMarkup(heading[2] ?? input.title) || input.title,
        lines: [],
      };
      continue;
    }

    if (!current) {
      current = { level: 1, heading: input.title, lines: [] };
    }
    current.lines.push(line);
  }
  pushCurrent();

  if (sections.length === 0) {
    sections.push({
      id: "body",
      heading: input.title,
      body: cleanBody([normalized]),
      level: 1,
      path: [input.title],
    });
  }

  const plainText = sections
    .map((section) => `${section.path?.join(" > ") ?? section.heading}\n${section.body}`)
    .join("\n\n");

  return {
    title: input.title,
    plainText,
    sections,
  };
}
