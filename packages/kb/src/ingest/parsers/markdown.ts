import {
  type ParseKbDocumentInput,
  type ParsedKbDocument,
  parseKbDocument,
} from "../parse-document.js";

export const KEENI_KB_KB18_PARSER = {
  enabled: true,
  target: "kb.ingest.parser.markdown",
  notes:
    "KB-18: markdown/html-ish parser normalizes headings, hierarchy, links, lists, and code blocks.",
} as const;

/** KB-18 markdown parser entry. */
export function parseKbMarkdownDocument(input: ParseKbDocumentInput): ParsedKbDocument {
  return parseKbDocument({ ...input, contentType: input.contentType ?? "text/markdown" });
}
