import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ChannelConnectionConfig, ChannelWebhookRequest } from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailChannelPlugin } from "../src/plugin.js";
import { parseEmailDeliveryReceipts, verifyMailgunSignatureFields } from "../src/receipts.js";

const snsPrivateKey = readFileSync(
  fileURLToPath(new URL("./fixtures/sns-test-private-key.pem", import.meta.url)),
  "utf8",
);
const snsCertificate = readFileSync(
  fileURLToPath(new URL("./fixtures/sns-test-certificate.pem", import.meta.url)),
  "utf8",
);

afterEach(() => vi.unstubAllGlobals());

describe("email delivery receipts", () => {
  it("normalizes SES notifications and prefers the original RFC Message-ID", () => {
    const body = encode({
      Type: "Notification",
      Message: JSON.stringify({
        notificationType: "Bounce",
        mail: {
          messageId: "ses-provider-id",
          headers: [{ name: "Message-ID", value: "outbound@example.com" }],
        },
        bounce: {
          timestamp: "2026-09-22T10:00:00.000Z",
          bounceType: "Permanent",
          bouncedRecipients: [
            { status: "5.1.1", diagnosticCode: "smtp; 550 mailbox does not exist" },
          ],
        },
      }),
    });

    expect(parseEmailDeliveryReceipts(body)).toEqual([
      expect.objectContaining({
        providerMessageId: "<outbound@example.com>",
        status: "failed",
        errorCode: "5.1.1",
        errorMessage: "smtp; 550 mailbox does not exist",
        occurredAt: new Date("2026-09-22T10:00:00.000Z"),
      }),
    ]);
  });

  it("normalizes SendGrid batches including delivered, read, and failed states", () => {
    const receipts = parseEmailDeliveryReceipts(
      encode([
        {
          event: "delivered",
          "smtp-id": "<sendgrid@example.com>",
          timestamp: 1_795_000_000,
        },
        { event: "open", "smtp-id": "<sendgrid@example.com>", timestamp: 1_795_000_010 },
        {
          event: "bounce",
          "smtp-id": "<sendgrid@example.com>",
          timestamp: 1_795_000_020,
          status: "5.1.1",
          reason: "Mailbox unavailable",
        },
      ]),
    );

    expect(receipts.map((receipt) => receipt.status)).toEqual(["delivered", "read", "failed"]);
    expect(receipts[2]).toMatchObject({
      providerMessageId: "<sendgrid@example.com>",
      errorCode: "5.1.1",
      errorMessage: "Mailbox unavailable",
    });
  });

  it("normalizes current Mailgun payloads and ignores temporary failures", () => {
    const delivered = parseEmailDeliveryReceipts(
      encode({
        event: "delivered",
        timestamp: 1_795_000_000.25,
        message: { headers: { "message-id": "mailgun@example.com" } },
      }),
    );
    const deferred = parseEmailDeliveryReceipts(
      encode({
        event: "temporary_fail",
        timestamp: 1_795_000_001,
        message: { headers: { "message-id": "mailgun@example.com" } },
      }),
    );

    expect(delivered[0]).toMatchObject({
      providerMessageId: "<mailgun@example.com>",
      status: "delivered",
    });
    expect(deferred).toEqual([]);
  });

  it("verifies SendGrid ECDSA signatures over the untouched raw body", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const verificationKey = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const rawBody = encode([{ event: "delivered", "smtp-id": "<signed@example.com>" }]);
    const timestamp = "1795000000";
    const signature = sign(
      "sha256",
      Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]),
      privateKey,
    ).toString("base64");

    const result = await createEmailChannelPlugin().verifyWebhook?.(
      webhookRequest(rawBody, "sendgrid", {
        "x-twilio-email-event-webhook-signature": signature,
        "x-twilio-email-event-webhook-timestamp": timestamp,
      }),
      connection({ sendgridWebhookVerificationKey: verificationKey }),
    );
    expect(result).toEqual({ accepted: true });
  });

  it("verifies Mailgun HMAC signatures", async () => {
    const signingKey = "mailgun-signing-key";
    const timestamp = "1795000000";
    const token = "mailgun-token";
    const signature = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");
    const rawBody = encode({
      signature: { timestamp, token, signature },
      "event-data": {
        event: "delivered",
        message: { headers: { "message-id": "mailgun@example.com" } },
      },
    });

    const result = await createEmailChannelPlugin().verifyWebhook?.(
      webhookRequest(rawBody, "mailgun"),
      connection({ mailgunWebhookSigningKey: signingKey }),
    );
    expect(result).toEqual({ accepted: true });
  });

  it("verifies Mailgun inbound form signature fields", () => {
    const signingKey = "mailgun-inbound-key";
    const timestamp = "1795000000";
    const token = "mailgun-inbound-token";
    const signature = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");

    expect(verifyMailgunSignatureFields({ timestamp, token, signature }, signingKey)).toBe(true);
    expect(
      verifyMailgunSignatureFields({ timestamp, token, signature: "0".repeat(64) }, signingKey),
    ).toBe(false);
  });

  it("verifies the SNS topic, trusted certificate URL, and RSA signature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(snsCertificate, { status: 200 })),
    );
    const topicArn = "arn:aws:sns:us-east-1:123456789012:keenai-email";
    const envelope: Record<string, string> = {
      Type: "Notification",
      MessageId: "sns-event-1",
      TopicArn: topicArn,
      Message: JSON.stringify({
        notificationType: "Delivery",
        mail: { headers: [{ name: "Message-ID", value: "<ses@example.com>" }] },
        delivery: { timestamp: "2026-09-22T10:00:00.000Z" },
      }),
      Timestamp: "2026-09-22T10:00:01.000Z",
      SignatureVersion: "2",
      SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
      Signature: "",
    };
    const canonical = ["Message", "MessageId", "Timestamp", "TopicArn", "Type"]
      .map((field) => `${field}\n${envelope[field]}\n`)
      .join("");
    envelope.Signature = sign("sha256", Buffer.from(canonical), snsPrivateKey).toString("base64");
    const rawBody = encode(envelope);

    const valid = await createEmailChannelPlugin().verifyWebhook?.(
      webhookRequest(rawBody, "ses"),
      connection({}, { sesTopicArn: topicArn }),
    );
    const wrongTopic = await createEmailChannelPlugin().verifyWebhook?.(
      webhookRequest(rawBody, "ses"),
      connection({}, { sesTopicArn: `${topicArn}-other` }),
    );

    expect(valid).toEqual({ accepted: true });
    expect(wrongTopic).toEqual({
      accepted: false,
      status: 403,
      reason: "ses_webhook_signature_invalid",
    });
  });

  it("advertises delivery and read receipt support", () => {
    expect(createEmailChannelPlugin().capabilities).toEqual(
      new Set(["text", "markdown", "attachments", "threads", "read_receipts", "delivery_receipts"]),
    );
  });
});

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function webhookRequest(
  rawBody: Uint8Array,
  provider: "ses" | "sendgrid" | "mailgun",
  headers: Record<string, string> = {},
): ChannelWebhookRequest {
  return {
    headers,
    query: { receiptProvider: provider },
    rawBody,
    receivedAt: new Date("2026-09-22T10:00:00.000Z"),
  };
}

function connection(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown> = {},
): ChannelConnectionConfig {
  return {
    connectionId: "email-connection",
    orgId: "org-1",
    brandId: "brand-1",
    channelType: "email",
    credentials,
    settings,
  };
}
