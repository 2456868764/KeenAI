import type { CanonicalDocument, CanonicalizeMessageInput } from "./types.js";

export function conversationMessageSourceRef(messageId: string): string {
  return `message:${messageId}`;
}

/** Build canonical Markdown for a conversation message (Memory Tree §5.2). */
export function canonicalizeConversationMessage(
  input: CanonicalizeMessageInput,
): CanonicalDocument {
  const attachments = input.attachments ?? [];
  const frontmatter: Record<string, string> = {
    orgId: input.orgId,
    brandId: input.brandId,
    source: input.source,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderType: input.senderType,
    sentAt: input.sentAt.toISOString(),
  };

  if (attachments.length > 0) {
    frontmatter.attachments = JSON.stringify(
      attachments.map((a) => ({
        id: a.id,
        mime: a.mime,
        fileName: a.fileName,
      })),
    );
  }

  const body = input.plainText.trim() || "(empty)";
  const bodyMd = renderCanonicalMarkdown(frontmatter, body);

  return { frontmatter, body, bodyMd };
}

function renderCanonicalMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", body);
  return lines.join("\n");
}
