import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  channelDeadLetters,
  channelDeliveryAttempts,
  channelDeliveryReceipts,
  channelMessageLinks,
  channelOutbox,
  conversations,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  admitIngressEvent,
  claimChannelConnectionRuntime,
  claimIngressEvent,
  claimOutboxDelivery,
  claimSessionCommand,
  completeIngressEvent,
  completeOutboxDelivery,
  completeSessionCommand,
  enqueueOutboxDelivery,
  enqueueSessionCommand,
  failOutboxDelivery,
  heartbeatChannelConnectionRuntime,
  recordDeliveryReceipt,
  releaseChannelConnectionRuntime,
  replayChannelDeadLetter,
  resolveChannelDeadLetter,
} from "./index.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../storage/migrations/libsql",
);

describe("durable channel runtime", () => {
  let store: ReturnType<typeof createLibsqlStore>;
  let databaseDirectory: string;
  let fixture: {
    orgId: string;
    brandId: string;
    connectionId: string;
    conversationId: string;
    messageId: string;
  };

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(path.join(tmpdir(), "keenai-channel-runtime-"));
    store = createLibsqlStore({ url: `file:${path.join(databaseDirectory, "test.sqlite")}` });
    await migrate(store.db, { migrationsFolder });
    const migratedTables = await store.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'channel_%' ORDER BY name",
    );
    expect(migratedTables.rows.map((row) => row.name)).toEqual([
      "channel_connections",
      "channel_conversation_links",
      "channel_dead_letters",
      "channel_delivery_attempts",
      "channel_delivery_receipts",
      "channel_identities",
      "channel_ingress_events",
      "channel_message_links",
      "channel_outbox",
      "channel_session_commands",
    ]);
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "channel-runtime", name: "Channel Runtime" })
      .returning();
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [conversation] = await store.db
      .insert(conversations)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id ?? "",
        channelType: "slack",
        channelId: "thread-1",
      })
      .returning();
    const [message] = await store.db
      .insert(messages)
      .values({
        orgId: org?.id ?? "",
        conversationId: conversation?.id ?? "",
        senderType: "agent",
        content: { text: "Hello" },
        plainText: "Hello",
      })
      .returning();
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id ?? "",
        channelType: "slack",
        name: "Slack",
        externalAccountId: "team-1",
      })
      .returning();
    fixture = {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      connectionId: connection?.id ?? "",
      conversationId: conversation?.id ?? "",
      messageId: message?.id ?? "",
    };
  });

  afterEach(async () => {
    await store.close();
    await rm(databaseDirectory, { recursive: true, force: true });
  });

  it("deduplicates, leases, and completes inbound events", async () => {
    const input = {
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      channelType: "slack" as const,
      providerEventId: "event-1",
      eventType: "message",
      rawPayload: { event_id: "event-1" },
    };
    const first = await admitIngressEvent(store, input);
    const duplicate = await admitIngressEvent(store, input);
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);

    const claimed = await claimIngressEvent(store);
    expect(claimed?.event.id).toBe(first.event.id);
    expect(
      await completeIngressEvent(store, {
        eventId: first.event.id,
        claimToken: "stale-token",
      }),
    ).toBe(false);
    expect(
      await completeIngressEvent(store, {
        eventId: first.event.id,
        claimToken: claimed?.claimToken ?? "",
      }),
    ).toBe(true);
  });

  it("fences competing long-lived connection runtimes and persists cursors", async () => {
    await store.db
      .update(channelConnections)
      .set({ transport: "gateway" })
      .where(eq(channelConnections.id, fixture.connectionId));
    const startedAt = new Date("2026-09-18T10:00:00.000Z");
    const first = await claimChannelConnectionRuntime(store, {
      connectionId: fixture.connectionId,
      ownerId: "runtime-a",
      now: startedAt,
      leaseMs: 10_000,
    });
    expect(first?.connection.runtimeState).toBe("connecting");
    expect(
      await claimChannelConnectionRuntime(store, {
        connectionId: fixture.connectionId,
        ownerId: "runtime-b",
        now: new Date(startedAt.getTime() + 5_000),
      }),
    ).toBeNull();

    const second = await claimChannelConnectionRuntime(store, {
      connectionId: fixture.connectionId,
      ownerId: "runtime-b",
      now: new Date(startedAt.getTime() + 11_000),
    });
    expect(second).not.toBeNull();
    expect(
      await heartbeatChannelConnectionRuntime(store, {
        connectionId: fixture.connectionId,
        ownerId: "runtime-a",
        leaseToken: first?.leaseToken ?? "",
      }),
    ).toBe(false);
    expect(
      await heartbeatChannelConnectionRuntime(store, {
        connectionId: fixture.connectionId,
        ownerId: "runtime-b",
        leaseToken: second?.leaseToken ?? "",
        cursor: { sequence: 42 },
      }),
    ).toBe(true);

    const [connected] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, fixture.connectionId));
    expect(connected?.runtimeState).toBe("connected");
    expect(connected?.runtimeCursor).toEqual({ sequence: 42 });
    expect(
      await releaseChannelConnectionRuntime(store, {
        connectionId: fixture.connectionId,
        ownerId: "runtime-b",
        leaseToken: second?.leaseToken ?? "",
      }),
    ).toBe(true);
  });

  it("serializes commands within one conversation", async () => {
    for (const id of ["command-1", "command-2"]) {
      await enqueueSessionCommand(store, {
        orgId: fixture.orgId,
        brandId: fixture.brandId,
        conversationId: fixture.conversationId,
        commandType: "message",
        idempotencyKey: id,
        payload: { id },
      });
    }

    const first = await claimSessionCommand(store, {
      conversationId: fixture.conversationId,
    });
    expect(first?.command.sequence).toBe(1);
    expect(await claimSessionCommand(store, { conversationId: fixture.conversationId })).toBeNull();
    expect(
      await completeSessionCommand(store, {
        commandId: first?.command.id ?? "",
        claimToken: first?.claimToken ?? "",
      }),
    ).toBe(true);

    const second = await claimSessionCommand(store, {
      conversationId: fixture.conversationId,
    });
    expect(second?.command.sequence).toBe(2);
  });

  it("retries delivery and records final provider acceptance", async () => {
    const input = {
      deliveryId: "delivery-1",
      idempotencyKey: "message-1:slack",
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: fixture.conversationId,
      messageId: fixture.messageId,
      channelType: "slack" as const,
      externalThreadId: "thread-1",
      parts: [{ type: "text" as const, text: "Hello" }],
    };
    expect((await enqueueOutboxDelivery(store, input)).duplicate).toBe(false);
    expect((await enqueueOutboxDelivery(store, input)).duplicate).toBe(true);

    const first = await claimOutboxDelivery(store);
    expect(first?.delivery.attempts).toBe(1);
    const retryAt = new Date(Date.now() + 10_000);
    expect(
      await failOutboxDelivery(store, {
        outboxId: first?.delivery.id ?? "",
        claimToken: first?.claimToken ?? "",
        error: { disposition: "retryable", code: "timeout", message: "timeout" },
        now: retryAt,
      }),
    ).toBe("retrying");

    const second = await claimOutboxDelivery(store, {
      now: new Date(retryAt.getTime() + 2_000),
    });
    expect(second?.delivery.attempts).toBe(2);
    expect(
      await completeOutboxDelivery(store, {
        outboxId: second?.delivery.id ?? "",
        claimToken: second?.claimToken ?? "",
        providerMessageIds: ["slack-message-1"],
        providerResponse: { ok: true },
      }),
    ).toBe(true);

    const attempts = await store.db
      .select()
      .from(channelDeliveryAttempts)
      .where(eq(channelDeliveryAttempts.outboxId, "delivery-1"));
    const links = await store.db
      .select()
      .from(channelMessageLinks)
      .where(eq(channelMessageLinks.providerMessageId, "slack-message-1"));
    const receipts = await store.db
      .select()
      .from(channelDeliveryReceipts)
      .where(eq(channelDeliveryReceipts.providerMessageId, "slack-message-1"));
    expect(attempts).toHaveLength(2);
    expect(links).toHaveLength(1);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["accepted"]);

    expect(
      await recordDeliveryReceipt(store, {
        orgId: fixture.orgId,
        connectionId: fixture.connectionId,
        receipt: {
          providerMessageId: "slack-message-1",
          status: "read",
          occurredAt: new Date("2026-09-18T08:26:40.000Z"),
          payload: { event: "message_read" },
        },
      }),
    ).toBe(true);
    const [updatedMessage] = await store.db
      .select()
      .from(messages)
      .where(eq(messages.id, fixture.messageId));
    const updatedReceipts = await store.db
      .select()
      .from(channelDeliveryReceipts)
      .where(eq(channelDeliveryReceipts.providerMessageId, "slack-message-1"));
    expect(updatedMessage?.deliveryStatus).toBe("read");
    expect(updatedReceipts.map((receipt) => receipt.status)).toEqual(["accepted", "read"]);
  });

  it("does not blindly replay an unknown-after-send result", async () => {
    await enqueueOutboxDelivery(store, {
      deliveryId: "delivery-unknown",
      idempotencyKey: "message-unknown:slack",
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: fixture.conversationId,
      messageId: fixture.messageId,
      channelType: "slack",
      externalThreadId: "thread-1",
      parts: [{ type: "text", text: "May already be sent" }],
    });
    const claimed = await claimOutboxDelivery(store);
    expect(
      await failOutboxDelivery(store, {
        outboxId: claimed?.delivery.id ?? "",
        claimToken: claimed?.claimToken ?? "",
        error: {
          disposition: "unknown_after_send",
          code: "unknown_after_send",
          message: "connection dropped after request write",
        },
      }),
    ).toBe("dead_letter");
    const deadLetters = await store.db
      .select()
      .from(channelDeadLetters)
      .where(eq(channelDeadLetters.sourceId, "delivery-unknown"));
    expect(deadLetters).toHaveLength(1);
  });

  it("replays and resolves a delivery dead letter", async () => {
    await enqueueOutboxDelivery(store, {
      deliveryId: "delivery-replay",
      idempotencyKey: "message-replay:slack",
      orgId: fixture.orgId,
      brandId: fixture.brandId,
      connectionId: fixture.connectionId,
      conversationId: fixture.conversationId,
      messageId: fixture.messageId,
      channelType: "slack",
      externalThreadId: "thread-1",
      parts: [{ type: "text", text: "Replay me" }],
    });
    const claimed = await claimOutboxDelivery(store);
    expect(
      await failOutboxDelivery(store, {
        outboxId: claimed?.delivery.id ?? "",
        claimToken: claimed?.claimToken ?? "",
        error: {
          disposition: "terminal",
          code: "provider_rejected",
          message: "provider rejected the message",
        },
      }),
    ).toBe("dead_letter");

    const [deadLetter] = await store.db
      .select()
      .from(channelDeadLetters)
      .where(eq(channelDeadLetters.sourceId, "delivery-replay"));
    const replayed = await replayChannelDeadLetter(store, {
      orgId: fixture.orgId,
      deadLetterId: deadLetter?.id ?? "",
    });
    expect(replayed).toEqual({ sourceType: "delivery", sourceId: "delivery-replay" });

    const [delivery] = await store.db
      .select()
      .from(channelOutbox)
      .where(eq(channelOutbox.id, "delivery-replay"));
    const [message] = await store.db
      .select()
      .from(messages)
      .where(eq(messages.id, fixture.messageId));
    const [updatedDeadLetter] = await store.db
      .select()
      .from(channelDeadLetters)
      .where(eq(channelDeadLetters.id, deadLetter?.id ?? ""));
    expect(delivery?.status).toBe("retrying");
    expect(delivery?.attempts).toBe(1);
    expect(delivery?.maxAttempts).toBe(16);
    expect(delivery?.lastError).toBeNull();
    expect(message?.deliveryStatus).toBe("pending");
    expect(updatedDeadLetter?.replayCount).toBe(1);
    expect(updatedDeadLetter?.resolvedAt).toBeInstanceOf(Date);

    expect(
      await resolveChannelDeadLetter(store, {
        orgId: fixture.orgId,
        deadLetterId: deadLetter?.id ?? "",
      }),
    ).toBe(true);
    expect(
      await resolveChannelDeadLetter(store, {
        orgId: "different-org",
        deadLetterId: deadLetter?.id ?? "",
      }),
    ).toBe(false);
  });
});
