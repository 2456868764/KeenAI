import type { AuthConfig } from "@keenai/auth";
import {
  createSmtpTransport,
  renderTicketStatusEmail,
  sendOutboundEmail,
} from "@keenai/channels-email";
import type { createLibsqlStore } from "@keenai/storage";
import { organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import type { SerializedTicket } from "./tickets.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export async function notifyTicketStatusChange(
  db: Db,
  authConfig: AuthConfig,
  input: { orgId: string; ticket: SerializedTicket; statusName: string },
) {
  const customerEmail = input.ticket.customerId;
  if (!customerEmail?.includes("@")) return { sent: false as const, reason: "no_customer_email" };

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  const portalBase = authConfig.portalAppUrl ?? authConfig.appUrl;
  const portalUrl = org
    ? `${portalBase}/tickets/${input.ticket.id}?org=${encodeURIComponent(org.slug)}`
    : undefined;

  const rendered = await renderTicketStatusEmail({
    ticketTitle: input.ticket.title,
    statusName: input.statusName,
    portalUrl,
    locale: "en",
  });

  if (!authConfig.smtp) {
    return { sent: false as const, reason: "smtp_not_configured", preview: rendered };
  }

  const transport = createSmtpTransport(authConfig.smtp);
  await sendOutboundEmail(transport, authConfig.smtp.from, {
    to: customerEmail,
    subject: rendered.subject,
    plainText: rendered.text,
    html: rendered.html,
  });

  return { sent: true as const };
}
