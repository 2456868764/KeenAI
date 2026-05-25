export type ParsedKbDocument = {
  title: string;
  plainText: string;
  sections: Array<{ id: string; heading: string; body: string }>;
};

export type ParseKbDocumentInput = {
  title: string;
  rawContent: string;
  contentType?: string | null;
};

/** Normalize markdown/HTML-ish KB raw content into plain sections. */
export function parseKbDocument(input: ParseKbDocumentInput): ParsedKbDocument {
  const normalized = input.rawContent.replace(/\r\n/g, "\n").trim();
  const sections: ParsedKbDocument["sections"] = [];
  const parts = normalized.split(/\n(?=#+\s)/);

  for (const part of parts) {
    const lines = part.trim().split("\n");
    const headingLine = lines[0] ?? "";
    const heading = headingLine.replace(/^#+\s*/, "").trim() || input.title;
    const body = lines.slice(1).join("\n").trim();
    if (!body) continue;

    const id = heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    sections.push({ id: id || "section", heading, body });
  }

  if (sections.length === 0) {
    sections.push({ id: "body", heading: input.title, body: normalized });
  }

  const plainText = sections.map((section) => `${section.heading}\n${section.body}`).join("\n\n");

  return {
    title: input.title,
    plainText,
    sections,
  };
}
