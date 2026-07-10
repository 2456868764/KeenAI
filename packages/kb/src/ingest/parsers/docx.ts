import {
  type ParseKbDocumentInput,
  type ParsedKbDocument,
  parseKbDocument,
} from "../parse-document.js";

export const KEENI_KB_KB18_DOCX_PARSER = {
  enabled: true,
  target: "kb.ingest.parser.docx",
  notes: "KB-18: DOCX parser extracts word/document.xml text before heading-aware chunking.",
} as const;

/** KB-18 DOCX parser entry. */
export function parseKbDocxDocument(input: ParseKbDocumentInput): ParsedKbDocument {
  return parseKbDocument({
    ...input,
    contentType:
      input.contentType ??
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
