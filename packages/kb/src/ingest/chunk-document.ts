import type { ParsedKbDocument } from "./parse-document.js";

export type KbChunkDraft = {
  chunkIndex: number;
  sectionId: string | null;
  content: string;
  contextPrefix: string | null;
};

function splitLongText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const sentenceBreak = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
    );
    const whitespaceBreak = window.lastIndexOf(" ");
    const cutAt = sentenceBreak > maxChars * 0.45 ? sentenceBreak + 1 : whitespaceBreak;
    const size = cutAt > maxChars * 0.35 ? cutAt : maxChars;
    chunks.push(remaining.slice(0, size).trim());
    remaining = remaining.slice(size).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function blockChunks(body: string, maxChars: number): string[] {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => (block.length > maxChars ? splitLongText(block, maxChars) : [block]));

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    current = block;
  }
  if (current) chunks.push(current);
  return chunks;
}

function overlapPrefix(previous: string | undefined, overlapChars: number): string {
  if (!previous || overlapChars <= 0) return "";
  const tail = previous.slice(-overlapChars).trim();
  const sentenceStart = Math.max(tail.indexOf(". "), tail.indexOf("。"));
  return sentenceStart > 0 ? tail.slice(sentenceStart + 1).trim() : tail;
}

/** Split parsed sections into retrieval-sized, heading-aware chunks. */
export function chunkKbDocument(
  parsed: ParsedKbDocument,
  maxChars = 800,
  overlapChars = 120,
): KbChunkDraft[] {
  const drafts: KbChunkDraft[] = [];
  let chunkIndex = 0;

  for (const section of parsed.sections) {
    const prefix = [parsed.title, ...(section.path ?? [section.heading])].join(" > ");
    const chunks = blockChunks(section.body, maxChars);

    for (const [index, chunk] of chunks.entries()) {
      const overlap = index > 0 ? overlapPrefix(chunks[index - 1], overlapChars) : "";
      const content = overlap ? `${overlap}\n\n${chunk}` : chunk;

      drafts.push({
        chunkIndex,
        sectionId: section.id,
        content,
        contextPrefix: prefix,
      });
      chunkIndex += 1;
    }
  }

  return drafts;
}
