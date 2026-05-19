import nodemailer from "nodemailer";
import { type ReplyTemplateVars, renderAgentReplyHtml, renderAgentReplyText } from "./templates.js";
import type { OutboundEmailInput, SmtpTransportConfig } from "./types.js";

export function createSmtpTransport(config: SmtpTransportConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
}

export async function sendOutboundEmail(
  transport: nodemailer.Transporter,
  from: string,
  input: OutboundEmailInput,
): Promise<{ messageId: string }> {
  const info = await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.plainText,
    html: input.html,
    inReplyTo: input.inReplyTo,
    references: input.references?.join(" "),
  });

  const messageId =
    typeof info.messageId === "string" ? info.messageId : `sent-${Date.now()}@keenai.local`;
  return { messageId };
}

export async function sendAgentReply(
  transport: nodemailer.Transporter,
  from: string,
  to: string,
  vars: ReplyTemplateVars,
  headers?: { inReplyTo?: string; references?: string[] },
): Promise<{ messageId: string }> {
  return sendOutboundEmail(transport, from, {
    to,
    subject: vars.conversationSubject.startsWith("Re:")
      ? vars.conversationSubject
      : `Re: ${vars.conversationSubject}`,
    plainText: renderAgentReplyText(vars),
    html: renderAgentReplyHtml(vars),
    inReplyTo: headers?.inReplyTo,
    references: headers?.references,
  });
}
