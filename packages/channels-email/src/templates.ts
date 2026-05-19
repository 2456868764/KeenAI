export type ReplyTemplateVars = {
  agentName: string;
  plainText: string;
  conversationSubject: string;
  footer?: string;
};

/** Plain-text agent reply template (React Email templates can replace this later). */
export function renderAgentReplyText(vars: ReplyTemplateVars): string {
  const footer = vars.footer ?? "— Sent via KeenAI";
  return `${vars.plainText}\n\n${footer}`;
}

export function renderAgentReplyHtml(vars: ReplyTemplateVars): string {
  const footer = vars.footer ?? "Sent via KeenAI";
  const escaped = escapeHtml(vars.plainText).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html><body><p>${escaped}</p><p style="color:#666;font-size:12px">${escapeHtml(footer)}</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
