export type ParsedKbDocument = {
  title: string;
  plainText: string;
  sections: Array<{ id: string; heading: string; body: string; level?: number; path?: string[] }>;
};

export type ParseKbDocumentInput = {
  title: string;
  rawContent: string;
  contentType?: string | null;
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
  const source =
    input.contentType?.includes("html") || /<\/?[a-z][\s\S]*>/i.test(input.rawContent)
      ? htmlToMarkdownish(input.rawContent)
      : input.rawContent;
  const normalized = normalizeMarkdown(source);
  const sections: ParsedKbDocument["sections"] = [];
  const seenIds = new Map<string, number>();
  const headingStack: Array<{ level: number; heading: string }> = [];
  let current: { level: number; heading: string; lines: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const body = cleanBody(current.lines);
    if (!body) return;

    while (headingStack.length && headingStack[headingStack.length - 1]?.level >= current.level) {
      headingStack.pop();
    }
    headingStack.push({ level: current.level, heading: current.heading });

    const path = headingStack.map((item) => item.heading);
    sections.push({
      id: uniqueId(slugify(path.join("-")), seenIds),
      heading: current.heading,
      body,
      level: current.level,
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
