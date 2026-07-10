import {
  type ParseKbDocumentInput,
  type ParsedKbDocument,
  parseKbDocument,
} from "../parse-document.js";

export const KEENI_KB_KB18_PDF_PARSER = {
  enabled: true,
  target: "kb.ingest.parser.pdf",
  notes: "KB-18: PDF parser extracts common text operators before heading-aware chunking.",
} as const;

/** KB-18 PDF parser entry. */
export function parseKbPdfDocument(input: ParseKbDocumentInput): ParsedKbDocument {
  return parseKbDocument({ ...input, contentType: input.contentType ?? "application/pdf" });
}
