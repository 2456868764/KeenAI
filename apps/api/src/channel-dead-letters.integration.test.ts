import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import {
  claimOutboxDelivery,
  enqueueOutboxDelivery,
  failOutboxDelivery,
} from "@keenai/channels-runtime";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  auditLogs,
  brands,
  channelConnections,
  channelDeadLetters,
  channelOutbox,
  conversations,
  members,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("channel dead-letter administration", () => {
  it("lists, replays, resolves, and audits failed channel work", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-channel-dlq-"));
    tempDirs.push(directory);
    const databaseUrl = `file:${path.join(directory, "test.sqlite")}`;
    const store = createLibsqlStore({ url: databaseUrl });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const fixture = await seedFixture(store);
    await createDeadLetter(store, fixture, "failed-delivery-1");
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const accessToken = await login(app);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const listed = await app.request("/api/v1/dashboard/channel-dead-letters", { headers });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      items: Array<{ id: string; reasonCode: string }>;
    };
    expect(listedBody.items).toHaveLength(1);
    expect(listedBody.items[0]?.reasonCode).toBe("provider_rejected");

    const replayed = await app.request(
      `/api/v1/dashboard/channel-dead-letters/${listedBody.items[0]?.id}/replay`,
      { method: "POST", headers },
    );
    expect(replayed.status).toBe(200);
    await eventually(async () => {
      const [delivery] = await store.db
        .select()
        .from(channelOutbox)
        .where(eq(channelOutbox.id, "failed-delivery-1"));
      expect(delivery?.status).toBe("completed");
    });

    await createDeadLetter(store, fixture, "failed-delivery-2");
    const [secondDeadLetter] = await store.db
      .select()
      .from(channelDeadLetters)
      .where(eq(channelDeadLetters.sourceId, "failed-delivery-2"));
    const resolved = await app.request(
      `/api/v1/dashboard/channel-dead-letters/${secondDeadLetter?.id}/resolve`,
      { method: "POST", headers },
    );
    expect(resolved.status).toBe(200);
    const audits = await store.db.select().from(auditLogs);
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      "channel.dead_letter.replayed",
      "channel.dead_letter.resolved",
    ]);
    await store.close();
  });
});

async function seedFixture(store: ReturnType<typeof createLibsqlStore>) {
  const [orgRow] = await store.db
    .insert(organizations)
    .values({ slug: "channel-dlq", name: "Channel DLQ" })
    .returning();
  const org = requireRow(orgRow, "org");
  const [brandRow] = await store.db
    .insert(brands)
    .values({ orgId: org.id, slug: "default", name: "Default" })
    .returning();
  const brand = requireRow(brandRow, "brand");
  const [accountRow] = await store.db
    .insert(accounts)
    .values({
      email: "owner@channel-dlq.test",
      name: "Owner",
      passwordHash: await hashPassword("password12345"),
    })
    .returning();
  const account = requireRow(accountRow, "account");
  await store.db.insert(members).values({
    orgId: org.id,
    accountId: account.id,
    role: "admin",
    status: "active",
  });
  const [conversationRow] = await store.db
    .insert(conversations)
    .values({
      orgId: org.id,
      brandId: brand.id,
      channelType: "messenger",
      channelId: "widget-session",
    })
    .returning();
  const conversation = requireRow(conversationRow, "conversation");
  const [messageRow] = await store.db
    .insert(messages)
    .values({
      orgId: org.id,
      conversationId: conversation.id,
      senderType: "agent",
      content: { text: "hello" },
      plainText: "hello",
    })
    .returning();
  const message = requireRow(messageRow, "message");
  const [connectionRow] = await store.db
    .insert(channelConnections)
    .values({
      orgId: org.id,
      brandId: brand.id,
      channelType: "widget",
      name: "Widget",
    })
    .returning();
  const connection = requireRow(connectionRow, "connection");
  return { org, brand, account, conversation, message, connection };
}

async function createDeadLetter(
  store: ReturnType<typeof createLibsqlStore>,
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  deliveryId: string,
) {
  await enqueueOutboxDelivery(store, {
    deliveryId,
    idempotencyKey: `${deliveryId}:widget`,
    orgId: fixture.org.id,
    brandId: fixture.brand.id,
    connectionId: fixture.connection.id,
    conversationId: fixture.conversation.id,
    messageId: fixture.message.id,
    channelType: "widget",
    externalThreadId: "widget-session",
    parts: [{ type: "text", text: "hello" }],
  });
  const claimed = await claimOutboxDelivery(store, { outboxId: deliveryId });
  await failOutboxDelivery(store, {
    outboxId: deliveryId,
    claimToken: claimed?.claimToken ?? "",
    error: {
      disposition: "terminal",
      code: "provider_rejected",
      message: "provider rejected the message",
    },
  });
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/v1/dashboard/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@channel-dlq.test",
      password: "password12345",
      orgSlug: "channel-dlq",
    }),
  });
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
