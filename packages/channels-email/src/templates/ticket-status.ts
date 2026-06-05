export type TicketStatusEmailInput = {
  ticketTitle: string;
  statusName: string;
  portalUrl?: string;
  locale?: "en" | "zh";
};

const COPY = {
  en: {
    subject: (title: string, status: string) => `Ticket update: ${title} → ${status}`,
    heading: "Your ticket was updated",
    status: "Status",
    cta: "View in portal",
  },
  zh: {
    subject: (title: string, status: string) => `工单更新：${title} → ${status}`,
    heading: "您的工单状态已更新",
    status: "状态",
    cta: "在门户中查看",
  },
} as const;

export function renderTicketStatusEmail(input: TicketStatusEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const locale = input.locale ?? "en";
  const t = COPY[locale];

  const subject = t.subject(input.ticketTitle, input.statusName);
  const lines = [t.heading, "", `${input.ticketTitle}`, `${t.status}: ${input.statusName}`];
  if (input.portalUrl) lines.push("", `${t.cta}: ${input.portalUrl}`);
  const text = lines.join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">
  <h2 style="margin:0 0 12px">${t.heading}</h2>
  <p style="margin:0 0 8px"><strong>${escapeHtml(input.ticketTitle)}</strong></p>
  <p style="margin:0 0 16px">${t.status}: <strong>${escapeHtml(input.statusName)}</strong></p>
  ${
    input.portalUrl
      ? `<p><a href="${escapeAttr(input.portalUrl)}" style="color:#2563eb">${t.cta}</a></p>`
      : ""
  }
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
