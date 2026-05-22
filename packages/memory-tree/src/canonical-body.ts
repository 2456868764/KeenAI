/** Extract user-visible body text from canonical Markdown (after frontmatter). */
export function extractBodyFromCanonicalMd(bodyMd: string): string {
  const match = bodyMd.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match?.[1]?.trim() ?? bodyMd.trim();
}

/** Rough token estimate for buffer sizing (chars / 4). */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Resolve message id from chunk metadata or source_ref. */
export function messageIdFromChunk(input: {
  sourceRef: string;
  metadata: Record<string, unknown>;
}): string | null {
  const fromMeta = input.metadata.messageId;
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
  if (input.sourceRef.startsWith("message:")) {
    return input.sourceRef.slice("message:".length);
  }
  return null;
}
