import { createCipheriv, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  admitIngressEvent,
  enqueueOutboxDelivery,
  enqueueOutboxOperation,
} from "@keenai/channels-runtime";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  channelConversationLinks,
  channelDeadLetters,
  channelDeliveryReceipts,
  channelIngressEvents,
  channelMessageLinks,
  channelOutbox,
  channelSessionCommands,
  conversations,
  memoryChunks,
  messages,
  organizations,
  reactions,
  workflowRuns,
  workflows,
} from "@keenai/storage/schema";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import {
  createProviderAttachmentUrl,
  insertAttachment,
  verifyProviderAttachmentToken,
} from "./lib/attachments.js";
import {
  drainChannelDispatch,
  enqueueMessageForChannelDelivery,
  executeConversationTyping,
  processChannelIngress,
  processChannelOutbox,
  resolveOutboundReplyContext,
} from "./lib/channel-dispatch.js";
import { sealChannelCredentials } from "./lib/channel-secrets.js";
import { insertMessage } from "./lib/conversations.js";
import { ensureInboundEmailConversation, serializeInboundEmail } from "./lib/email-ingest.js";
import { ensureInboundImConversation } from "./lib/im-ingest.js";
import { generateStorageKey, saveUploadFile } from "./lib/uploads.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const tempDirs: string[] = [];
const telegramWebhookSecret = "telegram-runtime-webhook-secret";
const telegramWebhookHeaders = {
  "Content-Type": "application/json",
  "x-telegram-bot-api-secret-token": telegramWebhookSecret,
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("durable channel runtime", () => {
  it("threads automatic Email replies to the latest inbound provider message", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({ channelType: "email" })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "email",
        channelId: "<root@example.com>",
        userId: "customer@example.com",
        subject: "Support request",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");

    const inboundMessages = [];
    for (const [index, providerMessageId] of [
      "<root@example.com>",
      "<latest-inbound@example.com>",
    ].entries()) {
      const [message] = await fixture.store.db
        .insert(messages)
        .values({
          orgId: fixture.orgId,
          conversationId: conversation.id,
          senderType: "user",
          senderId: "customer@example.com",
          content: { type: "text", text: `Inbound ${index}` },
          plainText: `Inbound ${index}`,
          createdAt: new Date(Date.UTC(2026, 9, 2, 8, index)),
        })
        .returning();
      if (!message) throw new Error("missing_message");
      inboundMessages.push(message);
      await fixture.store.db.insert(channelMessageLinks).values({
        orgId: fixture.orgId,
        connectionId: fixture.connectionId,
        conversationId: conversation.id,
        messageId: message.id,
        providerMessageId,
        direction: "inbound",
        createdAt: new Date(Date.UTC(2026, 9, 2, 8, index)),
      });
    }

    const automatic = await resolveOutboundReplyContext(fixture.store.db, {
      channelType: "email",
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      conversationProviderMessageId: conversation.channelId,
    });
    expect(automatic).toEqual({
      replyToProviderMessageId: "<latest-inbound@example.com>",
      references: ["<root@example.com>", "<latest-inbound@example.com>"],
    });

    const explicit = await resolveOutboundReplyContext(fixture.store.db, {
      channelType: "email",
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      conversationProviderMessageId: conversation.channelId,
      inReplyToMessageId: inboundMessages[0]?.id,
    });
    expect(explicit).toEqual({
      replyToProviderMessageId: "<root@example.com>",
      references: ["<root@example.com>"],
    });
    await fixture.store.close();
  });

  it("routes an Email reply to the conversation linked to an outbound SMTP Message-ID", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({ channelType: "email" })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "email",
        channelId: "<root@example.com>",
        userId: "customer@example.com",
        subject: "Support request",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    const [outbound] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        content: { type: "text", text: "Agent response" },
        plainText: "Agent response",
        deliveryStatus: "delivered",
      })
      .returning();
    if (!outbound) throw new Error("missing_message");
    await fixture.store.db.insert(channelMessageLinks).values({
      orgId: fixture.orgId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      messageId: outbound.id,
      providerMessageId: "<smtp-agent-reply@example.com>",
      direction: "outbound",
    });
    const admission = await admitIngressEvent(fixture.store, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      channelType: "email",
      providerEventId: "<customer-reply@example.com>",
      eventType: "message",
      rawPayload: serializeInboundEmail({
        messageId: "<customer-reply@example.com>",
        inReplyTo: "<smtp-agent-reply@example.com>",
        references: ["<root@example.com>", "<smtp-agent-reply@example.com>"],
        from: { address: "customer@example.com" },
        to: [{ address: "support@example.com" }],
        subject: "Re: Support request",
        plainText: "The issue is still happening.",
        attachments: [],
      }),
    });

    await expect(
      processChannelIngress(fixture.context, admission.event.id, { dispatchSession: false }),
    ).resolves.toMatchObject({ processed: true, conversationId: conversation.id });
    expect(await fixture.store.db.select().from(conversations)).toHaveLength(1);
    await fixture.store.close();
  });

  it("isolates Email subject fallback between channel connections", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({ channelType: "email", externalAccountId: "support-one@example.com" })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [secondConnection] = await fixture.store.db
      .insert(channelConnections)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "email",
        name: "Second mailbox",
        externalAccountId: "support-two@example.com",
      })
      .returning();
    if (!secondConnection) throw new Error("missing_connection");
    const [firstConversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "email",
        channelId: "<first-mailbox-root@example.com>",
        userId: "customer@example.com",
        subject: "Shared subject",
        status: "open",
      })
      .returning();
    if (!firstConversation) throw new Error("missing_conversation");
    await fixture.store.db.insert(channelConversationLinks).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: firstConversation.id,
      externalThreadId: firstConversation.channelId,
    });

    const ensured = await ensureInboundEmailConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: secondConnection.id,
      parsed: {
        messageId: "<second-mailbox-root@example.com>",
        references: [],
        from: { address: "customer@example.com" },
        to: [{ address: "support-two@example.com" }],
        subject: "Shared subject",
        plainText: "This belongs to the second mailbox.",
        attachments: [],
      },
    });

    expect(ensured.created).toBe(true);
    expect(ensured.conversation.id).not.toBe(firstConversation.id);
    await fixture.store.close();
  });

  it("converges concurrent first Email messages onto one linked conversation", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({ channelType: "email" })
      .where(eq(channelConnections.id, fixture.connectionId));
    const parsed = {
      messageId: "<concurrent-root@example.com>",
      references: [],
      from: { address: "customer@example.com" },
      to: [{ address: "support@example.com" }],
      subject: "Concurrent request",
      plainText: "Please help.",
      attachments: [],
    };

    const ensured = await Promise.all([
      ensureInboundEmailConversation(fixture.store.db, {
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        connectionId: fixture.connectionId,
        parsed,
      }),
      ensureInboundEmailConversation(fixture.store.db, {
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        connectionId: fixture.connectionId,
        parsed,
      }),
    ]);

    expect(new Set(ensured.map((result) => result.conversation.id)).size).toBe(1);
    expect(ensured.filter((result) => result.created)).toHaveLength(1);
    expect(await fixture.store.db.select().from(conversations)).toHaveLength(1);
    expect(await fixture.store.db.select().from(channelConversationLinks)).toHaveLength(1);
    await fixture.store.close();
  });

  it("uses the latest inbound WhatsApp message for the official typing indicator", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        channelType: "whatsapp",
        externalAccountId: "phone-1",
        status: "active",
        credentials: sealChannelCredentials(
          { accessToken: "whatsapp-token", phoneNumberId: "phone-1" },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "whatsapp",
        channelId: "15551234567",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    await fixture.store.db.insert(channelConversationLinks).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      externalThreadId: "15551234567",
    });
    for (const [index, providerMessageId] of ["wamid-older", "wamid-newest"].entries()) {
      const [message] = await fixture.store.db
        .insert(messages)
        .values({
          orgId: fixture.orgId,
          conversationId: conversation.id,
          senderType: "user",
          senderId: "15551234567",
          content: { type: "text", text: `Inbound ${index}` },
          plainText: `Inbound ${index}`,
          deliveryStatus: "delivered",
          createdAt: new Date(Date.UTC(2026, 8, 18, 8, index)),
        })
        .returning();
      if (!message) throw new Error("missing_message");
      await fixture.store.db.insert(channelMessageLinks).values({
        orgId: fixture.orgId,
        connectionId: fixture.connectionId,
        conversationId: conversation.id,
        messageId: message.id,
        providerMessageId,
        direction: "inbound",
        createdAt: new Date(Date.UTC(2026, 8, 18, 8, index)),
      });
    }

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeConversationTyping({
        orgId: fixture.orgId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual({ executed: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v20.0/phone-1/messages");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid-newest",
      typing_indicator: { type: "text" },
    });
    await fixture.store.close();
  });

  it("serves provider attachments without dashboard auth only when the scoped signature is valid", async () => {
    const fixture = await createFixture();
    const storageKey = generateStorageKey("txt");
    const content = new TextEncoder().encode("signed provider attachment");
    await saveUploadFile(fixture.context.env, storageKey, content);
    const attachment = await insertAttachment(fixture.store.db, {
      orgId: fixture.orgId,
      storageKey,
      fileName: "provider.txt",
      contentType: "text/plain",
      sizeBytes: content.byteLength,
    });
    const signedUrl = new URL(
      createProviderAttachmentUrl({
        baseUrl: fixture.context.env.APP_URL,
        attachmentId: attachment.id,
        orgId: fixture.orgId,
        secret: fixture.context.authConfig.jwtSecret,
      }),
    );

    const accepted = await fixture.app.request(`${signedUrl.pathname}${signedUrl.search}`);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("cache-control")).toBe("private, no-store");
    expect(await accepted.text()).toBe("signed provider attachment");

    signedUrl.searchParams.set("org", "another-org");
    const rejected = await fixture.app.request(`${signedUrl.pathname}${signedUrl.search}`);
    expect(rejected.status).toBe(403);
    await fixture.store.close();
  });

  it("refreshes attachment URLs with a scoped signature immediately before provider delivery", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        credentials: sealChannelCredentials(
          { botToken: "telegram-token" },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "telegram",
        channelId: "9001",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    await fixture.store.db.insert(channelConversationLinks).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      externalThreadId: "9001",
    });
    const [message] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        content: { type: "image", attachmentId: "attachment-1" },
        plainText: "",
        deliveryStatus: "pending",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    const { delivery } = await enqueueOutboxDelivery(fixture.store, {
      deliveryId: "telegram-signed-attachment",
      idempotencyKey: "telegram-signed-attachment",
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      messageId: message.id,
      channelType: "telegram",
      externalThreadId: "9001",
      parts: [{ type: "image", attachmentId: "attachment-1" }],
      metadata: {
        attachments: [
          {
            attachmentId: "attachment-1",
            contentUrl: "https://stale.example/attachment.png",
            contentType: "image/png",
            fileName: "attachment.png",
          },
        ],
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 88 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(processChannelOutbox(fixture.context, delivery.id)).resolves.toEqual({
      processed: true,
      providerMessageIds: ["88"],
    });
    const telegramBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      photo: string;
    };
    const providerUrl = new URL(telegramBody.photo);
    expect(providerUrl.origin).toBe("http://localhost:8090");
    expect(providerUrl.pathname).toBe("/api/v1/attachments/attachment-1/provider-content");
    expect(providerUrl.toString()).not.toContain("stale.example");
    expect(
      verifyProviderAttachmentToken({
        attachmentId: "attachment-1",
        orgId: fixture.orgId,
        expiresAt: providerUrl.searchParams.get("expires") ?? "",
        signature: providerUrl.searchParams.get("signature") ?? "",
        secret: fixture.context.authConfig.jwtSecret,
      }),
    ).toBe(true);
    await fixture.store.close();
  });

  it("sends Slack thread replies to the provider channel and the stable thread root", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        channelType: "slack",
        credentials: sealChannelCredentials(
          { botToken: "xoxb-thread-token" },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "slack",
        channelId: "C-support",
        status: "open",
        attributes: { teamId: "T1" },
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    await fixture.store.db.insert(channelConversationLinks).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      externalThreadId: "C-support:1710000000.100",
      metadata: {
        providerTargetId: "C-support",
        providerThreadId: "1710000000.100",
        teamId: "T1",
      },
    });
    const [message] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        content: { type: "text", text: "Thread reply" },
        plainText: "Thread reply",
        deliveryStatus: "pending",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1710000000.200" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enqueueMessageForChannelDelivery({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        messageId: message.id,
      }),
    ).resolves.toMatchObject({ enqueued: true });
    await drainChannelDispatch();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      channel: string;
      thread_ts: string;
    };
    expect(body).toMatchObject({
      channel: "C-support",
      thread_ts: "1710000000.100",
    });
    await fixture.store.close();
  });

  it("isolates Slack channel threads while reusing subsequent replies", async () => {
    const fixture = await createFixture();
    const parsed = {
      platformMessageId: "1710000000.100",
      channelType: "slack" as const,
      channelId: "C-support",
      userId: "U1",
      plainText: "Root",
      parts: [{ type: "text" as const, text: "Root" }],
      messageKind: "text" as const,
      attachments: [],
    };
    const first = await ensureInboundImConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      parsed: {
        ...parsed,
        conversationKey: "C-support:1710000000.100",
        providerThreadId: "1710000000.100",
      },
    });
    const repeated = await ensureInboundImConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      parsed: {
        ...parsed,
        platformMessageId: "1710000000.200",
        conversationKey: "C-support:1710000000.100",
        providerThreadId: "1710000000.100",
      },
    });
    const another = await ensureInboundImConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      parsed: {
        ...parsed,
        platformMessageId: "1720000000.100",
        conversationKey: "C-support:1720000000.100",
        providerThreadId: "1720000000.100",
      },
    });

    expect(repeated.conversation.id).toBe(first.conversation.id);
    expect(another.conversation.id).not.toBe(first.conversation.id);
    await fixture.store.close();
  });

  it("verifies and decrypts a self-built Feishu HTTP callback before durable admission", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        channelType: "feishu",
        name: "Feishu",
        credentials: sealChannelCredentials(
          {
            appId: "cli_self_built",
            verificationToken: "feishu-verification-token",
            encryptKey: "feishu-encrypt-key",
          },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));

    const payload = {
      schema: "2.0",
      header: {
        app_id: "cli_self_built",
        token: "feishu-verification-token",
        event_type: "im.message.receive_v1",
        event_id: "evt-feishu-encrypted",
      },
      event: {
        sender: { sender_id: { open_id: "ou-customer" } },
        message: {
          message_id: "om-encrypted",
          chat_id: "oc-support",
          message_type: "text",
          content: JSON.stringify({ text: "Encrypted Feishu request" }),
        },
      },
    };
    const encryptKey = "feishu-encrypt-key";
    const wrapper = {
      encrypt: encryptFeishuPayload(JSON.stringify(payload), encryptKey),
    };
    const rawBody = JSON.stringify(wrapper);
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const nonce = "self-built-nonce";
    const signature = createHash("sha256")
      .update(`${timestamp}${nonce}${encryptKey}${rawBody}`)
      .digest("hex");

    const rejected = await fixture.app.request(
      `/api/v1/webhooks/im/feishu?org=channel-runtime&connection=${fixture.connectionId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lark-request-timestamp": timestamp,
          "x-lark-request-nonce": nonce,
          "x-lark-signature": "invalid",
        },
        body: rawBody,
      },
    );
    expect(rejected.status).toBe(403);

    const accepted = await fixture.app.request(
      `/api/v1/webhooks/im/feishu?org=channel-runtime&connection=${fixture.connectionId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lark-request-timestamp": timestamp,
          "x-lark-request-nonce": nonce,
          "x-lark-signature": signature,
        },
        body: rawBody,
      },
    );
    expect(accepted.status).toBe(202);
    await eventually(async () => {
      const [event] = await fixture.store.db
        .select()
        .from(channelIngressEvents)
        .where(eq(channelIngressEvents.providerEventId, "evt-feishu-encrypted"));
      expect(event?.status).toBe("completed");
    });
    await fixture.store.close();
  });

  it("records a Feishu stream read receipt without creating a session command", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        channelType: "feishu",
        name: "Feishu",
        credentials: sealChannelCredentials(
          { appId: "cli_stream", appSecret: "stream-secret" },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "feishu",
        channelId: "oc-support",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    const [message] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        content: { type: "text", text: "Read this response" },
        plainText: "Read this response",
        deliveryStatus: "sent",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    await fixture.store.db.insert(channelMessageLinks).values({
      orgId: fixture.orgId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      messageId: message.id,
      providerMessageId: "om-stream-read",
      direction: "outbound",
    });
    const admission = await admitIngressEvent(fixture.store, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      channelType: "feishu",
      providerEventId: "evt-stream-read",
      eventType: "message",
      rawPayload: {
        schema: "2.0",
        header: {
          event_id: "evt-stream-read",
          event_type: "im.message.message_read_v1",
        },
        event: {
          message_id_list: ["om-stream-read"],
          reader: {
            read_time: "1790900000000",
            reader_id: { open_id: "ou-reader" },
          },
        },
      },
    });

    await expect(processChannelIngress(fixture.context, admission.event.id)).resolves.toMatchObject(
      {
        processed: true,
        receipts: 1,
      },
    );
    const [receipt] = await fixture.store.db.select().from(channelDeliveryReceipts);
    expect(receipt).toMatchObject({
      connectionId: fixture.connectionId,
      providerMessageId: "om-stream-read",
      status: "read",
    });
    const [updatedMessage] = await fixture.store.db
      .select()
      .from(messages)
      .where(eq(messages.id, message.id));
    expect(updatedMessage?.deliveryStatus).toBe("read");
    expect(await fixture.store.db.select().from(channelSessionCommands)).toHaveLength(0);
    const [ingress] = await fixture.store.db
      .select()
      .from(channelIngressEvents)
      .where(eq(channelIngressEvents.id, admission.event.id));
    expect(ingress?.status).toBe("completed");
    await fixture.store.close();
  });

  it("executes a durable provider edit and commits the local mutation", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        credentials: sealChannelCredentials(
          { botToken: "telegram-token" },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "telegram",
        channelId: "9001",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    await fixture.store.db.insert(channelConversationLinks).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      externalThreadId: "9001",
    });
    const [message] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        content: { type: "text", text: "Before" },
        plainText: "Before",
        deliveryStatus: "delivered",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    await fixture.store.db.insert(channelMessageLinks).values({
      orgId: fixture.orgId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      messageId: message.id,
      providerMessageId: "42",
      direction: "outbound",
    });
    const { delivery } = await enqueueOutboxOperation(fixture.store, {
      deliveryId: "telegram-edit-operation",
      idempotencyKey: "telegram-edit-operation",
      operation: {
        type: "edit",
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        connectionId: fixture.connectionId,
        conversationId: conversation.id,
        messageId: message.id,
        channelType: "telegram",
        externalThreadId: "9001",
        providerMessageId: "42",
        parts: [{ type: "text", text: "After" }],
      },
      mutation: {
        type: "edit",
        plainText: "After",
        content: { type: "text", text: "After" },
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await processChannelOutbox(fixture.context, delivery.id)).toEqual({
      processed: true,
      providerMessageIds: [],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.telegram.org/bottelegram-token/editMessageText",
    );
    const [updated] = await fixture.store.db
      .select()
      .from(messages)
      .where(eq(messages.id, message.id));
    expect(updated).toMatchObject({
      plainText: "After",
      deliveryStatus: "delivered",
    });
    expect(updated?.editedAt).toBeInstanceOf(Date);
    await fixture.store.close();
  });

  it("retries an Email OAuth credential failure before attempting SMTP delivery", async () => {
    const fixture = await createFixture();
    const [connection] = await fixture.store.db
      .insert(channelConnections)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "email",
        name: "OAuth Mailbox",
        externalAccountId: "support@example.com",
        transport: "polling",
        credentials: sealChannelCredentials(
          {
            oauthProvider: "google",
            accessToken: "expired",
            refreshToken: "refresh-token",
            expiresAt: Date.now() - 1_000,
            host: "smtp.gmail.com",
            port: 465,
            user: "support@example.com",
            from: "support@example.com",
          },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .returning();
    if (!connection) throw new Error("missing_connection");
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "email",
        channelId: "thread@example.com",
        userId: "customer@example.com",
        status: "open",
      })
      .returning();
    if (!conversation) throw new Error("missing_conversation");
    const [message] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        content: { text: "Reply" },
        plainText: "Reply",
        deliveryStatus: "pending",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    const { delivery } = await enqueueOutboxDelivery(fixture.store, {
      deliveryId: "email-oauth-failure",
      idempotencyKey: "email-oauth-failure",
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: connection.id,
      conversationId: conversation.id,
      messageId: message.id,
      channelType: "email",
      externalThreadId: "thread@example.com",
      parts: [{ type: "text", text: "Reply", format: "plain" }],
      metadata: { to: "customer@example.com", subject: "Support" },
    });
    await expect(processChannelOutbox(fixture.context, delivery.id)).rejects.toThrow(
      "email_oauth_client_not_configured",
    );
    const [outbox] = await fixture.store.db
      .select()
      .from(channelOutbox)
      .where(eq(channelOutbox.id, delivery.id));
    expect(outbox?.status).toBe("retrying");
    expect(outbox?.lastErrorCode).toBe("channel_credentials_unavailable");
    expect(await fixture.store.db.select().from(channelDeadLetters)).toHaveLength(0);
    await fixture.store.close();
  });

  it("persists and deduplicates ingress before serialized message processing", async () => {
    const fixture = await createFixture();
    const payload = {
      update_id: 91001,
      message: {
        message_id: 301,
        from: { id: 42, first_name: "Alex" },
        chat: { id: 9001, type: "private" },
        text: "Durable hello",
      },
    };
    const first = await fixture.app.request("/api/v1/webhooks/im/telegram?org=channel-runtime", {
      method: "POST",
      headers: telegramWebhookHeaders,
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as {
      eventId: string;
      duplicate: boolean;
    };
    expect(firstBody.duplicate).toBe(false);
    await eventually(async () => {
      const rows = await fixture.store.db
        .select()
        .from(messages)
        .where(eq(messages.plainText, "Durable hello"));
      expect(rows).toHaveLength(1);
    });

    const duplicate = await fixture.app.request(
      "/api/v1/webhooks/im/telegram?org=channel-runtime",
      {
        method: "POST",
        headers: telegramWebhookHeaders,
        body: JSON.stringify(payload),
      },
    );
    const duplicateBody = (await duplicate.json()) as {
      eventId: string;
      duplicate: boolean;
    };
    expect(duplicateBody).toMatchObject({
      eventId: firstBody.eventId,
      duplicate: true,
    });
    expect(await fixture.store.db.select().from(channelIngressEvents)).toHaveLength(1);
    expect(
      await fixture.store.db.select().from(messages).where(eq(messages.plainText, "Durable hello")),
    ).toHaveLength(1);
    await fixture.store.close();
  });

  it("fails closed when a production Telegram webhook has no provider secret", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({ credentials: {} })
      .where(eq(channelConnections.id, fixture.connectionId));

    const response = await fixture.app.request(
      `/api/v1/webhooks/im/telegram?org=channel-runtime&connection=${fixture.connectionId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_id: 91004,
          message: {
            message_id: 304,
            from: { id: 44, first_name: "Morgan" },
            chat: { id: 9004, type: "private" },
            text: "Unsigned production event",
          },
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await fixture.store.db.select().from(channelIngressEvents)).toHaveLength(0);
    await fixture.store.close();
  });

  it("requires an explicit connection when a webhook channel has multiple accounts", async () => {
    const fixture = await createFixture();
    await fixture.store.db.insert(channelConnections).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      channelType: "telegram",
      name: "Telegram Secondary",
      externalAccountId: "secondary",
    });
    const payload = {
      update_id: 91002,
      message: {
        message_id: 302,
        from: { id: 43, first_name: "Taylor" },
        chat: { id: 9002, type: "private" },
        text: "Account-routed hello",
      },
    };

    const ambiguous = await fixture.app.request(
      "/api/v1/webhooks/im/telegram?org=channel-runtime",
      {
        method: "POST",
        headers: telegramWebhookHeaders,
        body: JSON.stringify(payload),
      },
    );
    expect(ambiguous.status).toBe(409);

    const selected = await fixture.app.request(
      `/api/v1/webhooks/im/telegram?org=channel-runtime&connection=${fixture.connectionId}`,
      {
        method: "POST",
        headers: telegramWebhookHeaders,
        body: JSON.stringify(payload),
      },
    );
    expect(selected.status).toBe(202);
    await eventually(async () => {
      const [event] = await fixture.store.db.select().from(channelIngressEvents);
      expect(event?.connectionId).toBe(fixture.connectionId);
      expect(event?.status).toBe("completed");
    });
    await fixture.store.close();
  });

  it("persists final widget delivery before marking the message sent", async () => {
    const fixture = await createFixture();
    const [conversationRow] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "messenger",
        channelId: "widget-session-1",
        status: "open",
      })
      .returning();
    const conversation = requireRow(conversationRow, "conversation");
    const { message } = await insertMessage(fixture.store.db, {
      orgId: fixture.orgId,
      conversationId: conversation.id,
      senderType: "agent",
      plainText: "Durable reply",
      isInternal: false,
      sentVia: "workflow",
      isAgentReply: true,
    });

    await eventually(async () => {
      const [outbox] = await fixture.store.db
        .select()
        .from(channelOutbox)
        .where(eq(channelOutbox.messageId, message.id));
      expect(outbox?.status).toBe("completed");
      const [storedMessage] = await fixture.store.db
        .select()
        .from(messages)
        .where(eq(messages.id, message.id));
      expect(storedMessage?.deliveryStatus).toBe("sent");
    });
    await fixture.store.close();
  });

  it("isolates the same external thread across different provider connections", async () => {
    const fixture = await createFixture();
    const connections = await fixture.store.db
      .insert(channelConnections)
      .values([
        {
          orgId: fixture.orgId,
          brandId: fixture.brandId,
          channelType: "slack",
          name: "Workspace A",
          externalAccountId: "workspace-a",
        },
        {
          orgId: fixture.orgId,
          brandId: fixture.brandId,
          channelType: "slack",
          name: "Workspace B",
          externalAccountId: "workspace-b",
        },
      ])
      .returning();
    const parsed = {
      platformMessageId: "message-1",
      channelType: "slack" as const,
      channelId: "shared-channel-id",
      userId: "user-1",
      plainText: "hello",
      parts: [{ type: "text" as const, text: "hello" }],
      messageKind: "text" as const,
      attachments: [],
    };
    const first = await ensureInboundImConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: connections[0]?.id,
      parsed,
    });
    const second = await ensureInboundImConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: connections[1]?.id,
      parsed,
    });
    const repeated = await ensureInboundImConversation(fixture.store.db, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: connections[0]?.id,
      parsed,
    });

    expect(first.conversation.id).not.toBe(second.conversation.id);
    expect(repeated.conversation.id).toBe(first.conversation.id);
    expect(await fixture.store.db.select().from(channelConversationLinks)).toHaveLength(2);
    await fixture.store.close();
  });

  it("resumes a workflow button without inserting a customer message", async () => {
    const fixture = await createFixture();
    await fixture.store.db
      .update(channelConnections)
      .set({
        credentials: sealChannelCredentials(
          { botToken: "telegram-token", webhookSecret: telegramWebhookSecret },
          fixture.context.authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, fixture.connectionId));
    const [conversation] = await fixture.store.db
      .insert(conversations)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        channelType: "telegram",
        channelId: "9001",
        status: "open",
        messageCount: 1,
      })
      .returning();
    if (!conversation) throw new Error("conversation_missing");
    await fixture.store.db.insert(channelConversationLinks).values({
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      externalThreadId: "9001",
    });
    const definition = {
      trigger: "first_message" as const,
      blocks: [
        {
          id: "buttons",
          type: "reply_buttons" as const,
          prompt: "Choose a team",
          allowFreeText: false,
          buttons: [
            { id: "sales", label: "Sales", nextId: "sales-msg" },
            { id: "support", label: "Support", nextId: "support-msg" },
          ],
        },
        {
          id: "support-msg",
          type: "send_message" as const,
          plainText: "Support is on the way",
        },
        {
          id: "sales-msg",
          type: "send_message" as const,
          plainText: "Sales is on the way",
        },
      ],
    };
    const [workflow] = await fixture.store.db
      .insert(workflows)
      .values({
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        name: "Team chooser",
        trigger: "first_message",
        definition,
        publishedDefinition: definition,
        status: "published",
      })
      .returning();
    if (!workflow) throw new Error("workflow_missing");
    const [run] = await fixture.store.db
      .insert(workflowRuns)
      .values({
        orgId: fixture.orgId,
        workflowId: workflow.id,
        conversationId: conversation.id,
        status: "awaiting_input",
        definitionSnapshot: definition,
        steps: [
          {
            blockId: "buttons",
            type: "reply_buttons",
            status: "ok",
            output: { awaitingInput: true },
          },
        ] as never,
      })
      .returning();
    if (!run) throw new Error("run_missing");
    const [prompt] = await fixture.store.db
      .insert(messages)
      .values({
        orgId: fixture.orgId,
        conversationId: conversation.id,
        senderType: "agent",
        plainText: "Choose a team",
        content: {
          type: "workflow_reply_buttons",
          text: "Choose a team",
          workflow: {
            kind: "reply_buttons",
            workflowRunId: run.id,
            blockId: "buttons",
            buttons: [
              { id: "sales", label: "Sales" },
              { id: "support", label: "Support" },
            ],
          },
        },
        sentVia: "workflow",
      })
      .returning();
    if (!prompt) throw new Error("prompt_missing");
    await fixture.store.db.insert(channelMessageLinks).values({
      orgId: fixture.orgId,
      connectionId: fixture.connectionId,
      conversationId: conversation.id,
      messageId: prompt.id,
      providerMessageId: "123",
      direction: "outbound",
    });

    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true, result: true }));
    vi.stubGlobal("fetch", providerFetch);

    const response = await fixture.app.request(
      `/api/v1/webhooks/im/telegram?org=channel-runtime&connection=${fixture.connectionId}`,
      {
        method: "POST",
        headers: telegramWebhookHeaders,
        body: JSON.stringify({
          update_id: 91003,
          callback_query: {
            id: "click-1",
            from: { id: 42 },
            data: "sales",
            message: { message_id: 123, chat: { id: 9001 } },
          },
        }),
      },
    );
    expect(response.status).toBe(202);
    expect(providerFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/answerCallbackQuery",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ callback_query_id: "click-1" }),
      }),
    );
    await eventually(async () => {
      const [updated] = await fixture.store.db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, run.id));
      expect(updated?.status).toBe("completed");
      const rows = await fixture.store.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id));
      expect(rows.map((row) => row.plainText)).toContain("Sales is on the way");
      expect(rows.map((row) => row.plainText)).not.toContain("Support is on the way");
      expect(rows).toHaveLength(2);
    }, 8_000);
    await fixture.store.close();
  });

  it("applies inbound edits and reactions to the linked message without creating duplicates", async () => {
    const fixture = await createFixture();
    const send = (payload: unknown) =>
      fixture.app.request(
        `/api/v1/webhooks/im/telegram?org=channel-runtime&connection=${fixture.connectionId}`,
        {
          method: "POST",
          headers: telegramWebhookHeaders,
          body: JSON.stringify(payload),
        },
      );

    const created = await send({
      update_id: 92001,
      message: {
        message_id: 500,
        from: { id: 42 },
        chat: { id: 9001 },
        text: "Original",
      },
    });
    expect(created.status).toBe(202);
    await drainChannelDispatch();

    const edited = await send({
      update_id: 92002,
      edited_message: {
        message_id: 500,
        from: { id: 42 },
        chat: { id: 9001 },
        text: "Corrected",
      },
    });
    expect(edited.status).toBe(202);
    await drainChannelDispatch();

    const messageRows = await fixture.store.db.select().from(messages);
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0]).toMatchObject({ plainText: "Corrected" });
    expect(messageRows[0]?.editedAt).toBeInstanceOf(Date);
    const editedChunks = await fixture.store.db.select().from(memoryChunks);
    expect(editedChunks).toHaveLength(1);
    expect(editedChunks[0]?.bodyMd).toContain("Corrected");
    expect(editedChunks[0]?.bodyMd).not.toContain("Original");

    const reactionAdded = await send({
      update_id: 92003,
      message_reaction: {
        chat: { id: 9001 },
        message_id: 500,
        user: { id: 77 },
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: "👍" }],
      },
    });
    expect(reactionAdded.status).toBe(202);
    await drainChannelDispatch();
    expect(await fixture.store.db.select().from(reactions)).toMatchObject([
      {
        messageId: messageRows[0]?.id,
        actorType: "user",
        actorId: "77",
        emoji: "👍",
      },
    ]);

    const reactionRemoved = await send({
      update_id: 92004,
      message_reaction: {
        chat: { id: 9001 },
        message_id: 500,
        user: { id: 77 },
        old_reaction: [{ type: "emoji", emoji: "👍" }],
        new_reaction: [],
      },
    });
    expect(reactionRemoved.status).toBe(202);
    await drainChannelDispatch();
    expect(await fixture.store.db.select().from(reactions)).toHaveLength(0);
    expect(await fixture.store.db.select().from(messages)).toHaveLength(1);

    for (const [updateId, messageId] of [
      [92005, 600],
      [92006, 601],
    ] as const) {
      const businessMessage = await send({
        update_id: updateId,
        business_message: {
          message_id: messageId,
          business_connection_id: "business-1",
          from: { id: 42 },
          chat: { id: 9100 },
          text: `Business message ${messageId}`,
        },
      });
      expect(businessMessage.status).toBe(202);
      await drainChannelDispatch();
    }

    const businessDeletion = await send({
      update_id: 92007,
      deleted_business_messages: {
        business_connection_id: "business-1",
        chat: { id: 9100 },
        message_ids: [600, 601],
      },
    });
    expect(businessDeletion.status).toBe(202);
    await expect(businessDeletion.json()).resolves.toMatchObject({
      accepted: true,
      acceptedCount: 2,
    });
    await drainChannelDispatch();

    const businessLinks = await fixture.store.db
      .select({ messageId: channelMessageLinks.messageId })
      .from(channelMessageLinks)
      .where(inArray(channelMessageLinks.providerMessageId, ["600", "601"]));
    expect(businessLinks).toHaveLength(2);
    const deletedBusinessMessages = await fixture.store.db
      .select({ deletedAt: messages.deletedAt })
      .from(messages)
      .where(
        inArray(
          messages.id,
          businessLinks.map((link) => link.messageId),
        ),
      );
    expect(deletedBusinessMessages).toHaveLength(2);
    expect(deletedBusinessMessages.every((message) => message.deletedAt instanceof Date)).toBe(
      true,
    );
    expect(await fixture.store.db.select().from(messages)).toHaveLength(3);
    expect(await fixture.store.db.select().from(memoryChunks)).toHaveLength(1);

    await fixture.store.db
      .update(channelConnections)
      .set({ channelType: "slack" })
      .where(eq(channelConnections.id, fixture.connectionId));
    const deletion = await admitIngressEvent(fixture.store, {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      channelType: "slack",
      providerEventId: "Ev-delete-500",
      eventType: "message.deleted",
      rawPayload: {
        type: "event_callback",
        event_id: "Ev-delete-500",
        event: {
          type: "message",
          subtype: "message_deleted",
          channel: "C-support",
          deleted_ts: "500",
        },
      },
    });
    await processChannelIngress(fixture.context, deletion.event.id);
    await drainChannelDispatch();
    const [deleted] = await fixture.store.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageRows[0]?.id ?? ""));
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(await fixture.store.db.select().from(messages)).toHaveLength(3);
    expect(await fixture.store.db.select().from(memoryChunks)).toHaveLength(0);
    await fixture.store.close();
  });
});

async function createFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "keenai-channel-e2e-"));
  tempDirs.push(directory);
  const databasePath = path.join(directory, "runtime.db");
  const store = createLibsqlStore({ url: `file:${databasePath}` });
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/storage/migrations/libsql",
  );
  await migrate(store.db, { migrationsFolder });
  const [orgRow] = await store.db
    .insert(organizations)
    .values({ slug: "channel-runtime", name: "Channel Runtime" })
    .returning();
  const org = requireRow(orgRow, "org");
  const [brandRow] = await store.db
    .insert(brands)
    .values({ orgId: org.id, slug: "default", name: "Default" })
    .returning();
  const brand = requireRow(brandRow, "brand");
  const [connectionRow] = await store.db
    .insert(channelConnections)
    .values({
      orgId: org.id,
      brandId: brand.id,
      channelType: "telegram",
      name: "Telegram",
      externalAccountId: "default",
      credentials: { webhookSecret: telegramWebhookSecret },
    })
    .returning();
  const connection = requireRow(connectionRow, "connection");
  const env = parseApiEnv({
    NODE_ENV: "production",
    DATABASE_URL: `file:${databasePath}`,
    APP_URL: "http://localhost:8090",
    UPLOAD_DIR: path.join(directory, "uploads"),
  });
  const context = {
    store,
    fts: null,
    authConfig: {
      jwtSecret: "test-secret-at-least-32-characters-long!!",
      accessTtlSec: 900,
      refreshTtlSec: 604_800,
      appUrl: "http://localhost:3000",
    },
    env,
    log: createLogger(env),
    startedAt: new Date(),
  };
  const app = createApp(context);
  return {
    app,
    context,
    store,
    orgId: org.id,
    brandId: brand.id,
    connectionId: connection.id,
  };
}

async function eventually(assertion: () => Promise<void>, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (candidate) {
      error = candidate;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw error;
}

function encryptFeishuPayload(value: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const iv = Buffer.alloc(16, 7);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final()]).toString("base64");
}
