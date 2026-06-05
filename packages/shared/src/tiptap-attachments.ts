const ATTACHMENT_CONTENT_RE = /\/attachments\/([^/?#]+)\/content/;

function walkTiptapNode(node: unknown, ids: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;

  if (record.type === "image" && record.attrs && typeof record.attrs === "object") {
    const attrs = record.attrs as Record<string, unknown>;
    const attachmentId = attrs.attachmentId;
    if (typeof attachmentId === "string" && attachmentId.length > 0) {
      ids.add(attachmentId);
    }
    const src = attrs.src;
    if (typeof src === "string") {
      const match = src.match(ATTACHMENT_CONTENT_RE);
      if (match?.[1]) ids.add(match[1]);
    }
  }

  if (Array.isArray(record.content)) {
    for (const child of record.content) walkTiptapNode(child, ids);
  }
}

/** Collect attachment IDs embedded in a Tiptap document (image nodes). */
export function extractAttachmentIdsFromTiptapDoc(doc: unknown): string[] {
  const ids = new Set<string>();
  walkTiptapNode(doc, ids);
  return [...ids];
}
