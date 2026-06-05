import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { type ReactElement, createElement } from "react";

export type TicketStatusEmailProps = {
  ticketTitle: string;
  statusName: string;
  portalUrl?: string;
  locale?: "en" | "zh";
};

const COPY = {
  en: {
    heading: "Your ticket was updated",
    status: "Status",
    cta: "View in portal",
  },
  zh: {
    heading: "您的工单状态已更新",
    status: "状态",
    cta: "在门户中查看",
  },
} as const;

const bodyStyle = {
  backgroundColor: "#fafafa",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const containerStyle = { margin: "0 auto", padding: "32px 16px", maxWidth: "480px" };
const headingStyle = { fontSize: "20px", lineHeight: "28px", color: "#18181b", margin: "0 0 12px" };
const titleStyle = { fontSize: "16px", lineHeight: "24px", color: "#18181b", margin: "0 0 8px" };
const statusStyle = { fontSize: "15px", lineHeight: "22px", color: "#52525b", margin: "0 0 20px" };
const buttonStyle = {
  backgroundColor: "#6366f1",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "10px 18px",
};

export function TicketStatusEmail({
  ticketTitle,
  statusName,
  portalUrl,
  locale = "en",
}: TicketStatusEmailProps): ReactElement {
  const t = COPY[locale];

  return createElement(
    Html,
    null,
    createElement(Head),
    createElement(Preview, null, t.heading),
    createElement(
      Body,
      { style: bodyStyle },
      createElement(
        Container,
        { style: containerStyle },
        createElement(
          Section,
          null,
          createElement(Heading, { style: headingStyle }, t.heading),
          createElement(Text, { style: titleStyle }, createElement("strong", null, ticketTitle)),
          createElement(
            Text,
            { style: statusStyle },
            `${t.status}: `,
            createElement("strong", null, statusName),
          ),
          portalUrl ? createElement(Button, { href: portalUrl, style: buttonStyle }, t.cta) : null,
        ),
      ),
    ),
  );
}
