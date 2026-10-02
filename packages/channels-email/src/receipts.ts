import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import type {
  ChannelConnectionConfig,
  ChannelDeliveryReceipt,
  ChannelVerificationResult,
  ChannelWebhookRequest,
} from "@keenai/channels-core";

type EmailReceiptProvider = "ses" | "sendgrid" | "mailgun";

const snsCertificateCache = new Map<string, { certificate: string; expiresAt: number }>();

export function parseEmailDeliveryReceipts(
  rawBody: Uint8Array,
  fallbackDate = new Date(),
): ChannelDeliveryReceipt[] {
  const parsed = unwrapSnsNotification(parseReceiptPayload(rawBody));
  const events = Array.isArray(parsed) ? parsed : [parsed];
  return events.flatMap((event) => normalizeEmailReceiptEvent(event, fallbackDate));
}

export async function verifyEmailReceiptWebhook(
  request: ChannelWebhookRequest,
  connection: ChannelConnectionConfig,
): Promise<ChannelVerificationResult> {
  const provider = receiptProvider(request.query.receiptProvider);
  if (!provider) return { accepted: false, status: 400, reason: "email_receipt_provider_invalid" };
  try {
    const accepted =
      provider === "sendgrid"
        ? verifySendGridWebhook(request, connection)
        : provider === "mailgun"
          ? verifyMailgunWebhook(request, connection)
          : await verifySnsWebhook(request, connection);
    return accepted
      ? { accepted: true }
      : { accepted: false, status: 403, reason: `${provider}_webhook_signature_invalid` };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : `${provider}_webhook_verification_failed`;
    const configurationError = reason.endsWith("_required");
    return { accepted: false, status: configurationError ? 503 : 403, reason };
  }
}

export async function confirmSesSubscription(rawBody: Uint8Array): Promise<boolean> {
  const envelope = asRecord(parseReceiptPayload(rawBody));
  if (stringValue(envelope?.Type) !== "SubscriptionConfirmation") return false;
  const subscribeUrl = stringValue(envelope?.SubscribeURL);
  if (!subscribeUrl || !isTrustedSnsUrl(subscribeUrl, false)) {
    throw new Error("ses_subscribe_url_invalid");
  }
  const response = await fetchWithTimeout(subscribeUrl, { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error(`ses_subscription_confirmation_http_${response.status}`);
  return true;
}

function normalizeEmailReceiptEvent(event: unknown, fallbackDate: Date): ChannelDeliveryReceipt[] {
  const record = asRecord(event);
  if (!record) return [];
  return (
    normalizeSesReceipt(record, fallbackDate) ??
    normalizeSendGridReceipt(record, fallbackDate) ??
    normalizeMailgunReceipt(record, fallbackDate) ??
    []
  );
}

function normalizeSesReceipt(
  event: Record<string, unknown>,
  fallbackDate: Date,
): ChannelDeliveryReceipt[] | null {
  const notificationType = stringValue(event.notificationType) ?? stringValue(event.eventType);
  const mail = asRecord(event.mail);
  if (!notificationType || !mail) return null;
  const providerMessageId = sesOriginalMessageId(mail);
  if (!providerMessageId) return [];
  const type = notificationType.toLowerCase();
  if (type === "delivery") {
    const delivery = asRecord(event.delivery);
    return [
      receipt(providerMessageId, "delivered", dateValue(delivery?.timestamp), event, fallbackDate),
    ];
  }
  if (type === "send") {
    return [receipt(providerMessageId, "accepted", dateValue(mail.timestamp), event, fallbackDate)];
  }
  if (type === "open" || type === "click") {
    const engagement = asRecord(event[type]);
    return [
      receipt(providerMessageId, "read", dateValue(engagement?.timestamp), event, fallbackDate),
    ];
  }
  if (type === "bounce") {
    const bounce = asRecord(event.bounce);
    const firstRecipient = firstRecord(bounce?.bouncedRecipients);
    return [
      receipt(providerMessageId, "failed", dateValue(bounce?.timestamp), event, fallbackDate, {
        errorCode:
          stringValue(firstRecipient?.status) ?? stringValue(bounce?.bounceType) ?? "ses_bounce",
        errorMessage:
          stringValue(firstRecipient?.diagnosticCode) ??
          stringValue(bounce?.bounceSubType) ??
          "SES bounce",
      }),
    ];
  }
  if (type === "complaint") {
    const complaint = asRecord(event.complaint);
    return [
      receipt(providerMessageId, "failed", dateValue(complaint?.timestamp), event, fallbackDate, {
        errorCode: stringValue(complaint?.complaintFeedbackType) ?? "ses_complaint",
        errorMessage: "SES complaint",
      }),
    ];
  }
  if (type === "reject" || type === "rendering failure") {
    const failure = asRecord(event.reject) ?? asRecord(event.failure);
    return [
      receipt(providerMessageId, "failed", dateValue(mail.timestamp), event, fallbackDate, {
        errorCode: `ses_${type.replaceAll(" ", "_")}`,
        errorMessage: stringValue(failure?.reason) ?? `SES ${notificationType}`,
      }),
    ];
  }
  return [];
}

function normalizeSendGridReceipt(
  event: Record<string, unknown>,
  fallbackDate: Date,
): ChannelDeliveryReceipt[] | null {
  const eventType = stringValue(event.event)?.toLowerCase();
  const smtpId = stringValue(event["smtp-id"]);
  const providerMessageId = smtpId
    ? normalizeRfcMessageId(smtpId)
    : stringValue(event.sg_message_id);
  if (!eventType || !providerMessageId) return null;
  const status = sendGridStatus(eventType);
  if (!status) return [];
  const failure = status === "failed";
  return [
    receipt(providerMessageId, status, unixOrDate(event.timestamp), event, fallbackDate, {
      errorCode: failure ? (stringValue(event.status) ?? `sendgrid_${eventType}`) : undefined,
      errorMessage: failure
        ? (stringValue(event.reason) ?? stringValue(event.response))
        : undefined,
    }),
  ];
}

function normalizeMailgunReceipt(
  event: Record<string, unknown>,
  fallbackDate: Date,
): ChannelDeliveryReceipt[] | null {
  const eventData = recordValue(event["event-data"]);
  const payload = eventData ?? event;
  const eventType = stringValue(payload.event)?.toLowerCase();
  const message = recordValue(payload.message);
  const headers = recordValue(message?.headers);
  const providerMessageId = normalizeRfcMessageId(
    stringValue(headers?.["message-id"]) ??
      stringValue(payload["message-id"]) ??
      stringValue(payload.MessageId) ??
      "",
  );
  if (!eventType || !providerMessageId) return null;
  const severity = stringValue(payload.severity)?.toLowerCase();
  const status = mailgunStatus(eventType, severity);
  if (!status) return [];
  const deliveryStatus = recordValue(payload["delivery-status"] ?? payload.delivery_status);
  const failure = status === "failed";
  return [
    receipt(providerMessageId, status, unixOrDate(payload.timestamp), event, fallbackDate, {
      errorCode: failure
        ? severity
          ? `mailgun_${eventType}_${severity}`
          : `mailgun_${eventType}`
        : undefined,
      errorMessage: failure
        ? (stringValue(deliveryStatus?.message) ??
          stringValue(payload.reason) ??
          stringValue(payload.description))
        : undefined,
    }),
  ];
}

function receipt(
  providerMessageId: string,
  status: ChannelDeliveryReceipt["status"],
  occurredAt: Date | undefined,
  payload: unknown,
  fallbackDate: Date,
  error?: Pick<ChannelDeliveryReceipt, "errorCode" | "errorMessage">,
): ChannelDeliveryReceipt {
  return {
    providerMessageId,
    status,
    occurredAt: occurredAt ?? fallbackDate,
    ...(error?.errorCode ? { errorCode: error.errorCode } : {}),
    ...(error?.errorMessage ? { errorMessage: error.errorMessage } : {}),
    payload,
  };
}

function sendGridStatus(eventType: string): ChannelDeliveryReceipt["status"] | null {
  if (eventType === "processed") return "accepted";
  if (eventType === "delivered") return "delivered";
  if (eventType === "open" || eventType === "click") return "read";
  if (eventType === "bounce" || eventType === "dropped" || eventType === "spamreport") {
    return "failed";
  }
  return null;
}

function mailgunStatus(
  eventType: string,
  severity?: string,
): ChannelDeliveryReceipt["status"] | null {
  if (eventType === "accepted") return "accepted";
  if (eventType === "delivered") return "delivered";
  if (eventType === "opened" || eventType === "clicked") return "read";
  if (eventType === "permanent_fail" || eventType === "rejected" || eventType === "complained") {
    return "failed";
  }
  if (eventType === "failed" && severity !== "temporary") return "failed";
  return null;
}

function sesOriginalMessageId(mail: Record<string, unknown>): string | undefined {
  const headers = Array.isArray(mail.headers) ? mail.headers : [];
  for (const header of headers) {
    const value = asRecord(header);
    if (stringValue(value?.name)?.toLowerCase() === "message-id") {
      const messageId = stringValue(value?.value);
      if (messageId) return normalizeRfcMessageId(messageId);
    }
  }
  const commonHeaders = asRecord(mail.commonHeaders);
  const commonMessageId = stringValue(commonHeaders?.messageId ?? commonHeaders?.["message-id"]);
  if (commonMessageId) return normalizeRfcMessageId(commonMessageId);
  return stringValue(mail.messageId);
}

function verifySendGridWebhook(
  request: ChannelWebhookRequest,
  connection: ChannelConnectionConfig,
): boolean {
  const verificationKey = requiredConnectionValue(
    connection,
    "sendgridWebhookVerificationKey",
    "sendgrid_webhook_verification_key_required",
  );
  const signature = headerValue(request.headers, "x-twilio-email-event-webhook-signature");
  const timestamp = headerValue(request.headers, "x-twilio-email-event-webhook-timestamp");
  if (!signature || !timestamp) return false;
  const encodedKey = verificationKey.includes("BEGIN PUBLIC KEY")
    ? verificationKey
    : createPublicKey({
        key: Buffer.from(verificationKey, "base64"),
        format: "der",
        type: "spki",
      });
  return verifySignature(
    "sha256",
    Buffer.concat([Buffer.from(timestamp, "utf8"), Buffer.from(request.rawBody)]),
    encodedKey,
    Buffer.from(signature, "base64"),
  );
}

function verifyMailgunWebhook(
  request: ChannelWebhookRequest,
  connection: ChannelConnectionConfig,
): boolean {
  const signingKey = requiredConnectionValue(
    connection,
    "mailgunWebhookSigningKey",
    "mailgun_webhook_signing_key_required",
  );
  const payload = asRecord(parseReceiptPayload(request.rawBody));
  const signatureBlock = recordValue(payload?.signature);
  const timestamp = stringValue(signatureBlock?.timestamp ?? payload?.timestamp);
  const token = stringValue(signatureBlock?.token ?? payload?.token);
  const signature = stringValue(
    signatureBlock?.signature ??
      (typeof payload?.signature === "string" ? payload.signature : undefined),
  );
  return verifyMailgunSignatureFields({ timestamp, token, signature }, signingKey);
}

export function verifyMailgunSignatureFields(
  fields: { timestamp?: string; token?: string; signature?: string },
  signingKey: string,
): boolean {
  if (!fields.timestamp || !fields.token || !fields.signature || !signingKey.trim()) return false;
  const expected = createHmac("sha256", signingKey)
    .update(`${fields.timestamp}${fields.token}`)
    .digest("hex");
  return safeEqual(expected, fields.signature);
}

async function verifySnsWebhook(
  request: ChannelWebhookRequest,
  connection: ChannelConnectionConfig,
): Promise<boolean> {
  const envelope = asRecord(parseReceiptPayload(request.rawBody));
  if (!envelope) return false;
  const expectedTopicArn = requiredConnectionValue(
    connection,
    "sesTopicArn",
    "ses_topic_arn_required",
  );
  if (stringValue(envelope.TopicArn) !== expectedTopicArn) return false;
  const signatureVersion = stringValue(envelope.SignatureVersion);
  const signature = stringValue(envelope.Signature);
  const signingCertUrl = stringValue(envelope.SigningCertURL);
  if (
    (signatureVersion !== "1" && signatureVersion !== "2") ||
    !signature ||
    !signingCertUrl ||
    !isTrustedSnsUrl(signingCertUrl, true)
  ) {
    return false;
  }
  const canonical = snsCanonicalMessage(envelope);
  if (!canonical) return false;
  const certificate = await loadSnsCertificate(signingCertUrl);
  return verifySignature(
    signatureVersion === "1" ? "sha1" : "sha256",
    Buffer.from(canonical, "utf8"),
    createPublicKey(certificate),
    Buffer.from(signature, "base64"),
  );
}

function snsCanonicalMessage(envelope: Record<string, unknown>): string | null {
  const type = stringValue(envelope.Type);
  const fields =
    type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : type === "SubscriptionConfirmation" || type === "UnsubscribeConfirmation"
        ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
        : null;
  if (!fields) return null;
  let value = "";
  for (const field of fields) {
    const fieldValue = stringValue(envelope[field]);
    if (field === "Subject" && !fieldValue) continue;
    if (!fieldValue) return null;
    value += `${field}\n${fieldValue}\n`;
  }
  return value;
}

async function loadSnsCertificate(url: string): Promise<string> {
  const cached = snsCertificateCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.certificate;
  const response = await fetchWithTimeout(url, { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error(`ses_signing_certificate_http_${response.status}`);
  const certificate = await response.text();
  if (!certificate.includes("BEGIN CERTIFICATE") || certificate.length > 128_000) {
    throw new Error("ses_signing_certificate_invalid");
  }
  snsCertificateCache.set(url, { certificate, expiresAt: Date.now() + 60 * 60_000 });
  return certificate;
}

function isTrustedSnsUrl(value: string, certificate: boolean): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      !/^sns\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/.test(url.hostname)
    ) {
      return false;
    }
    return certificate
      ? /^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname)
      : url.pathname === "/";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapSnsNotification(value: unknown): unknown {
  const envelope = asRecord(value);
  if (!envelope || stringValue(envelope.Type) !== "Notification") return value;
  const message = stringValue(envelope.Message);
  if (!message) return [];
  try {
    return JSON.parse(message) as unknown;
  } catch {
    return [];
  }
}

function parseReceiptPayload(rawBody: Uint8Array): unknown {
  const text = new TextDecoder().decode(rawBody);
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function receiptProvider(value: string | undefined): EmailReceiptProvider | null {
  return value === "ses" || value === "sendgrid" || value === "mailgun" ? value : null;
}

function requiredConnectionValue(
  connection: ChannelConnectionConfig,
  key: string,
  error: string,
): string {
  const value = connection.credentials[key] ?? connection.settings[key];
  const text = stringValue(value);
  if (!text) throw new Error(error);
  return text;
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (direct) return direct;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function normalizeRfcMessageId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return trimmed.includes("@") ? `<${trimmed}>` : trimmed;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) ? asRecord(value[0]) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateValue(value: unknown): Date | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function unixOrDate(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1_000);
  const text = stringValue(value);
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return new Date(numeric * 1_000);
  return dateValue(text);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
