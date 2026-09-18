import type {
  ChannelClassifiedError,
  ChannelConnectionConfig,
  ChannelPlugin,
} from "@keenai/channels-core";
import { adaptRawMimeBody } from "./inbound-webhooks.js";
import { createSmtpTransport, sendOutboundEmail } from "./outbound.js";
import type { OutboundEmailAttachment, SmtpTransportConfig } from "./types.js";

export function createEmailChannelPlugin(): ChannelPlugin {
  return {
    type: "email",
    capabilities: new Set(["text", "markdown", "attachments", "threads"]),
    async parseWebhook(request) {
      const parsed = await adaptRawMimeBody(Buffer.from(request.rawBody));
      return [
        {
          providerEventId: parsed.messageId,
          eventType: "message",
          occurredAt: parsed.date ? new Date(parsed.date) : undefined,
          payload: parsed,
        },
      ];
    },
    async normalizeInbound(event) {
      const parsed = event.payload as Awaited<ReturnType<typeof adaptRawMimeBody>>;
      const externalThreadId = parsed.inReplyTo ?? parsed.references.at(-1) ?? parsed.messageId;
      return {
        providerEventId: event.providerEventId,
        providerMessageId: parsed.messageId,
        channelType: "email",
        externalThreadId,
        externalUserId: parsed.from.address,
        plainText: parsed.plainText,
        parts: [{ type: "text", text: parsed.plainText, format: "plain" }],
        attachments: parsed.attachments.map((attachment, index) => ({
          providerAttachmentId: `${parsed.messageId}:${index}`,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
        })),
        replyToProviderMessageId: parsed.inReplyTo,
        occurredAt: event.occurredAt,
        attributes: {
          subject: parsed.subject,
          fromName: parsed.from.name,
          to: parsed.to,
          references: parsed.references,
          html: parsed.html,
        },
      };
    },
    async send(envelope, connection) {
      const smtp = smtpConfig(connection);
      const transport = createSmtpTransport(smtp);
      try {
        const to = requiredString(envelope.metadata, "to");
        const subject = requiredString(envelope.metadata, "subject");
        const plainText = envelope.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n\n");
        const result = await sendOutboundEmail(transport, smtp.from, {
          to,
          subject,
          plainText,
          html: optionalString(envelope.metadata, "html"),
          inReplyTo: envelope.replyToProviderMessageId,
          references: optionalStringArray(envelope.metadata, "references"),
          attachments: emailAttachments(envelope.metadata),
        });
        return { providerMessageIds: [result.messageId], acceptedAt: new Date() };
      } finally {
        transport.close();
      }
    },
    classifyError: classifyEmailError,
  };
}

function smtpConfig(connection: ChannelConnectionConfig): SmtpTransportConfig {
  const value = connection.credentials;
  const host = requiredString(value, "host");
  const portValue = value.port;
  const port = typeof portValue === "number" ? portValue : Number(portValue);
  if (!Number.isInteger(port) || port <= 0) throw new Error("email_smtp_port_invalid");
  return {
    host,
    port,
    secure: typeof value.secure === "boolean" ? value.secure : undefined,
    user: optionalString(value, "user"),
    pass: optionalString(value, "pass"),
    from: requiredString(value, "from"),
  };
}

function requiredString(value: Record<string, unknown> | undefined, key: string): string {
  const result = optionalString(value, key);
  if (!result) throw new Error(`email_${key}_required`);
  return result;
}

function optionalString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const result = value?.[key];
  return typeof result === "string" && result.trim() ? result : undefined;
}

function optionalStringArray(
  value: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined {
  const result = value?.[key];
  if (!Array.isArray(result)) return undefined;
  return result.filter((entry): entry is string => typeof entry === "string");
}

function emailAttachments(
  metadata: Record<string, unknown> | undefined,
): OutboundEmailAttachment[] | undefined {
  const result = metadata?.attachments;
  if (!Array.isArray(result)) return undefined;
  const attachments = result.filter(isEmailAttachment);
  return attachments.length > 0 ? attachments : undefined;
}

function isEmailAttachment(value: unknown): value is OutboundEmailAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<OutboundEmailAttachment>;
  return typeof attachment.fileName === "string" && typeof attachment.contentBase64 === "string";
}

function classifyEmailError(error: unknown): ChannelClassifiedError {
  const candidate = error as { responseCode?: unknown; code?: unknown };
  const responseCode =
    typeof candidate?.responseCode === "number" ? candidate.responseCode : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (responseCode !== undefined && responseCode >= 500) {
    return { disposition: "retryable", code: `smtp_${responseCode}`, message };
  }
  if (responseCode !== undefined && responseCode >= 400) {
    return { disposition: "terminal", code: `smtp_${responseCode}`, message };
  }
  if (responseCode === undefined) {
    return {
      disposition: "unknown_after_send",
      code: "unknown_after_send",
      message,
    };
  }
  return {
    disposition: "retryable",
    code: typeof candidate?.code === "string" ? candidate.code : "smtp_unavailable",
    message,
  };
}
