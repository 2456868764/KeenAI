import { createHmac, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  channelDeliveryReceipts,
  channelMessageLinks,
  conversations,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/channels-email/tests/fixtures/simple-reply.eml",
  ),
);

const attachmentFixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/channels-email/tests/fixtures/with-attachment.eml",
  ),
);

const snsPrivateKey = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/channels-email/tests/fixtures/sns-test-private-key.pem",
  ),
  "utf8",
);
const snsCertificate = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/channels-email/tests/fixtures/sns-test-certificate.pem",
  ),
  "utf8",
);

const pdfAttachmentFixture = `From: customer@example.com
To: support@keenai.local
Subject: Manual PDF
Message-ID: <pdf1@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="keenai-pdf-boundary"

--keenai-pdf-boundary
Content-Type: text/plain; charset=utf-8

Please see the manual.

--keenai-pdf-boundary
Content-Type: application/pdf; name="manual.pdf"
Content-Disposition: attachment; filename="manual.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJUVPRgo=
--keenai-pdf-boundary--
`;

afterEach(() => vi.unstubAllGlobals());

describe("email webhook integration", () => {
  it("ingests raw MIME and threads by In-Reply-To", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });

    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    if (!org) throw new Error("org");

    await store.db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const first = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: `From: customer@example.com
To: support@keenai.local
Subject: Help with billing
Message-ID: <msg1@example.com>
Content-Type: text/plain

First email
`,
    });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { created: boolean; conversation: { id: string } };
    expect(firstBody.created).toBe(true);

    const second = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: fixture,
    });
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as {
      created: boolean;
      conversation: { id: string };
      thread: { matchReason: string };
    };
    expect(secondBody.created).toBe(false);
    expect(secondBody.conversation.id).toBe(firstBody.conversation.id);
    expect(secondBody.thread.matchReason).toBe("in-reply-to");

    await store.close();
  });

  it("requires connection-scoped authentication for raw MIME webhooks", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "secure-email", name: "Secure Email", plan: "free" })
      .returning();
    if (!org) throw new Error("org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "email",
        name: "Forwarding",
        externalAccountId: "support@example.com",
        credentials: { inboundWebhookSecret: "connection-secret" },
      })
      .returning();
    if (!connection) throw new Error("connection");
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const url = `/api/v1/webhooks/email/inbound?org=secure-email&connection=${connection.id}`;
    const request = (headers?: Record<string, string>) =>
      app.request(url, {
        method: "POST",
        headers,
        body: `From: customer@example.com
To: support@example.com
Subject: Secure inbound
Message-ID: <secure-inbound@example.com>
Content-Type: text/plain

Authenticated message
`,
      });

    expect((await request()).status).toBe(403);
    expect((await request({ "x-keenai-connection-secret": "wrong-secret" })).status).toBe(403);
    expect((await request({ "x-keenai-connection-secret": "connection-secret" })).status).toBe(202);
    await store.db
      .update(channelConnections)
      .set({
        credentials: {
          inboundWebhookUsername: "sendgrid",
          inboundWebhookPassword: "basic-secret",
        },
      })
      .where(eq(channelConnections.id, connection.id));
    expect(
      (
        await request({
          Authorization: `Basic ${Buffer.from("sendgrid:basic-secret").toString("base64")}`,
        })
      ).status,
    ).toBe(202);

    await store.close();
  });

  it("verifies and confirms SES inbound subscriptions", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "ses-inbound", name: "SES Inbound", plan: "free" })
      .returning();
    if (!org) throw new Error("org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");
    const topicArn = "arn:aws:sns:us-east-1:123456789012:keenai-inbound";
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "email",
        name: "SES",
        externalAccountId: "ses",
        settings: { sesTopicArn: topicArn },
      })
      .returning();
    if (!connection) throw new Error("connection");
    const envelope: Record<string, string> = {
      Type: "SubscriptionConfirmation",
      MessageId: "sns-inbound-subscription",
      Token: "subscription-token",
      TopicArn: topicArn,
      Message: "You have chosen to subscribe.",
      SubscribeURL:
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=subscription-token",
      Timestamp: "2026-09-23T10:00:00.000Z",
      SignatureVersion: "2",
      SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-inbound.pem",
      Signature: "",
    };
    const canonical = [
      "Message",
      "MessageId",
      "SubscribeURL",
      "Timestamp",
      "Token",
      "TopicArn",
      "Type",
    ]
      .map((field) => `${field}\n${envelope[field]}\n`)
      .join("");
    envelope.Signature = sign("sha256", Buffer.from(canonical), snsPrivateKey).toString("base64");
    const providerFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(snsCertificate, { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", providerFetch);
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const response = await app.request(
      `/api/v1/webhooks/email/ses?org=ses-inbound&connection=${connection.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, subscriptionConfirmed: true });
    expect(providerFetch).toHaveBeenCalledTimes(2);
    await store.close();
  });

  it("verifies Mailgun Routes signatures before ingesting inbound mail", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "mailgun-inbound", name: "Mailgun Inbound", plan: "free" })
      .returning();
    if (!org) throw new Error("org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");
    const signingKey = "mailgun-routes-signing-key";
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "email",
        name: "Mailgun Routes",
        externalAccountId: "support@example.com",
        credentials: { mailgunWebhookSigningKey: signingKey },
      })
      .returning();
    if (!connection) throw new Error("connection");
    const timestamp = "1795000000";
    const token = "mailgun-inbound-token";
    const signature = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");
    const form = new URLSearchParams({
      timestamp,
      token,
      signature,
      sender: "customer@example.com",
      recipient: "support@example.com",
      subject: "Mailgun inbound",
      "stripped-text": "Signed inbound message",
      "Message-Id": "<mailgun-inbound@example.com>",
    });
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const url = `/api/v1/webhooks/email/mailgun?org=mailgun-inbound&connection=${connection.id}`;
    const send = (body: URLSearchParams) =>
      app.request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    const invalid = new URLSearchParams(form);
    invalid.set("signature", "0".repeat(64));

    expect((await send(invalid)).status).toBe(403);
    expect((await send(form)).status).toBe(202);

    await store.close();
  });

  it("ingests MIME attachments into conversation messages", async () => {
    const uploadDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../data/test-email-attachments",
    );
    const env = parseApiEnv({ NODE_ENV: "test", UPLOAD_DIR: uploadDir });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });

    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    if (!org) throw new Error("org");

    await store.db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const res = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: attachmentFixture,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      conversation: { id: string };
      message: { messageKind: string; attachments: { fileName: string | null }[] };
    };
    expect(body.message.messageKind).toBe("photo");
    expect(body.message.attachments).toHaveLength(1);
    expect(body.message.attachments[0]?.fileName).toBe("error.png");

    await store.close();
  });

  it("keeps PDF attachment placeholders in inbound email plainText", async () => {
    const uploadDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../data/test-email-pdf-attachments",
    );
    const env = parseApiEnv({ NODE_ENV: "test", UPLOAD_DIR: uploadDir });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });

    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    if (!org) throw new Error("org");

    await store.db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const res = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: pdfAttachmentFixture,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      message: {
        plainText: string;
        messageKind: string;
        attachments: { fileName: string | null; contentType: string | null }[];
      };
    };
    expect(body.message.messageKind).toBe("document");
    expect(body.message.plainText).toContain("Please see the manual.");
    expect(body.message.plainText).toContain("[File: manual.pdf]");
    expect(body.message.attachments).toHaveLength(1);
    expect(body.message.attachments[0]?.fileName).toBe("manual.pdf");
    expect(body.message.attachments[0]?.contentType).toBe("application/pdf");

    await store.close();
  });

  it("verifies, records, and deduplicates Mailgun delivery receipts", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "receipts", name: "Receipts", plan: "free" })
      .returning();
    if (!org) throw new Error("org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");
    const signingKey = "mailgun-signing-key";
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "email",
        name: "Mailgun",
        externalAccountId: "support@example.com",
        status: "active",
        credentials: { mailgunWebhookSigningKey: signingKey },
      })
      .returning();
    if (!connection) throw new Error("connection");
    const [conversation] = await store.db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "email",
        channelId: "<thread@example.com>",
        userId: "customer@example.com",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("conversation");
    const [message] = await store.db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conversation.id,
        senderType: "agent",
        content: { type: "text", text: "Delivered reply" },
        plainText: "Delivered reply",
        deliveryStatus: "sent",
      })
      .returning();
    if (!message) throw new Error("message");
    await store.db.insert(channelMessageLinks).values({
      orgId: org.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      messageId: message.id,
      providerMessageId: "<mailgun-receipt@example.com>",
      direction: "outbound",
    });
    const timestamp = "1795000000";
    const token = "mailgun-event-token";
    const signature = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");
    const payload = JSON.stringify({
      signature: { timestamp, token, signature },
      "event-data": {
        event: "delivered",
        timestamp: Number(timestamp),
        message: { headers: { "message-id": "mailgun-receipt@example.com" } },
      },
    });
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const url = `/api/v1/webhooks/email/receipts/mailgun?org=receipts&connection=${connection.id}`;
    const first = await app.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const second = await app.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ accepted: true, receipts: 1, recorded: 1 });
    expect(second.status).toBe(202);
    expect(await second.json()).toMatchObject({ accepted: true, receipts: 1, recorded: 0 });
    const [updated] = await store.db.select().from(messages).where(eq(messages.id, message.id));
    expect(updated?.deliveryStatus).toBe("delivered");
    expect(await store.db.select().from(channelDeliveryReceipts)).toHaveLength(1);

    const rejected = await app.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload.replace(signature, "0".repeat(signature.length)),
    });
    expect(rejected.status).toBe(403);
    expect(await store.db.select().from(channelDeliveryReceipts)).toHaveLength(1);
    await store.close();
  });
});
