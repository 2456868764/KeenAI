import { render } from "@react-email/render";
import { TicketStatusEmail } from "./ticket-status-email.js";

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

export async function renderTicketStatusEmail(input: TicketStatusEmailInput): Promise<{
  subject: string;
  text: string;
  html: string;
}> {
  const locale = input.locale ?? "en";
  const t = COPY[locale];

  const subject = t.subject(input.ticketTitle, input.statusName);
  const lines = [t.heading, "", input.ticketTitle, `${t.status}: ${input.statusName}`];
  if (input.portalUrl) lines.push("", `${t.cta}: ${input.portalUrl}`);
  const text = lines.join("\n");

  const html = await render(TicketStatusEmail(input));

  return { subject, text, html };
}
