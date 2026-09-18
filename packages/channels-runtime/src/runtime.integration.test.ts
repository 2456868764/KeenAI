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
  conversations,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  admitIngressEvent,
  claimIngressEvent,
  claimOutboxDelivery,
  claimSessionCommand,
  completeIngressEvent,
  completeOutboxDelivery,
  completeSessionCommand,
  enqueueOutboxDelivery,
  enqueueSessionCommand,
  failOutboxDelivery,
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
});
