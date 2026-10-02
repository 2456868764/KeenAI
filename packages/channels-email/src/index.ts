export type {
  OutboundEmailAttachment,
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
export {
  renderAgentMarkdownHtml,
  renderAgentReplyHtml,
  renderAgentReplyText,
  type ReplyTemplateVars,
} from "./templates.js";
export { renderTicketStatusEmail, type TicketStatusEmailInput } from "./templates/ticket-status.js";
export {
  adaptMailgunInbound,
  adaptRawMimeBody,
  adaptSendGridInbound,
  adaptSesNotification,
} from "./inbound-webhooks.js";
export {
  createImapPollClient,
  pollImapMailboxes,
  type ImapPollClient,
  type ImapPollConfig,
  type ImapPollResult,
} from "./imap-poll.js";
export { createEmailChannelPlugin } from "./plugin.js";
export {
  confirmSesSubscription,
  parseEmailDeliveryReceipts,
  verifyEmailReceiptWebhook,
  verifyMailgunSignatureFields,
} from "./receipts.js";
