import type { ParsedKbDocument } from "./parse-document.js";

export type KbChunkDraft = {
  chunkIndex: number;
  sectionId: string | null;
  content: string;
  contextPrefix: string | null;
};

/** Split parsed sections into retrieval-sized chunks (heading-aware stub). */
export function chunkKbDocument(parsed: ParsedKbDocument, maxChars = 800): KbChunkDraft[] {
  const drafts: KbChunkDraft[] = [];
  let chunkIndex = 0;

  for (const section of parsed.sections) {
    const prefix = `${parsed.title} > ${section.heading}`;
    let remaining = section.body.trim();

    while (remaining.length > 0) {
      const slice = remaining.slice(0, maxChars).trim();
      remaining = remaining.slice(maxChars).trim();
      if (!slice) break;

      drafts.push({
        chunkIndex,
        sectionId: section.id,
        content: slice,
        contextPrefix: prefix,
      });
      chunkIndex += 1;
    }
  }

  return drafts;
}
