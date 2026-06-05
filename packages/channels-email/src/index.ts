export type {
  OutboundEmailInput,
  ParsedEmailAttachment,
  ParsedInboundEmail,
  ParsedInboundEmailWithAttachments,
  SmtpTransportConfig,
  ThreadCandidate,
} from "./types.js";
export { parsedInboundEmailSchema } from "./types.js";
export { parseMimeSource } from "./parse.js";
export { normalizeSubject, resolveThreadChannelId, type ExistingThread } from "./threading.js";
export { createSmtpTransport, sendAgentReply, sendOutboundEmail } from "./outbound.js";
export { renderAgentReplyHtml, renderAgentReplyText, type ReplyTemplateVars } from "./templates.js";
export { renderTicketStatusEmail, type TicketStatusEmailInput } from "./templates/ticket-status.js";
export {
  adaptMailgunInbound,
  adaptRawMimeBody,
  adaptSendGridInbound,
  adaptSesNotification,
} from "./inbound-webhooks.js";
export { pollImapMailboxes, type ImapPollConfig, type ImapPollResult } from "./imap-poll.js";
export {
  EMAIL_SEND_DLQ,
  EMAIL_SEND_QUEUE,
  closeEmailSendResources,
  createEmailSendQueue,
  createInMemoryEmailSendHandler,
  enqueueEmailSend,
  sendEmailNow,
  startEmailSendWorker,
  type EmailSendJobData,
  type EmailSendQueueDeps,
} from "./email-send-queue.js";
