import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  channelConnections,
  channelConversationLinks,
  channelMessageLinks,
  conversations,
  members,
  messages,
  organizations,
  reactions,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { sealChannelCredentials } from "./lib/channel-secrets.js";
import { subscribeConversation } from "./lib/conversation-bus.js";
import { createLogger } from "./logger.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("dashboard message operations", () => {
  it("edits, reacts to, and deletes a Slack message through the durable runtime", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-message-operations-"));
    tempDirectories.push(directory);
    const databaseUrl = `file:${path.join(directory, "operations.db")}`;
    const store = createLibsqlStore({ url: databaseUrl });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "message-operations", name: "Message Operations" })
      .returning();
    if (!org) throw new Error("missing_org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const [account] = await store.db
      .insert(accounts)
      .values({
        email: "agent@operations.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    if (!brand || !account) throw new Error("missing_fixture");
    const [member] = await store.db
      .insert(members)
      .values({ orgId: org.id, accountId: account.id, role: "admin", status: "active" })
      .returning();
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "slack",
        name: "Slack",
        externalAccountId: "team-1",
        status: "active",
        credentials: sealChannelCredentials({ botToken: "slack-token" }, authConfig.jwtSecret),
      })
      .returning();
    const [conversation] = await store.db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "slack",
        channelId: "C123",
      })
      .returning();
    if (!member || !connection || !conversation) throw new Error("missing_fixture");
    await store.db.insert(channelConversationLinks).values({
      orgId: org.id,
      brandId: brand.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      externalThreadId: "C123",
    });
    const [message] = await store.db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conversation.id,
        senderType: "agent",
        senderId: member.id,
        content: { type: "text", text: "Before" },
        plainText: "Before",
        deliveryStatus: "delivered",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    await store.db.insert(channelMessageLinks).values({
      orgId: org.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      messageId: message.id,
      providerMessageId: "1700.01",
      providerAction: "chat.postMessage",
      providerResourceType: "message",
      actionIndex: 0,
      direction: "outbound",
    });
    await store.db.insert(channelMessageLinks).values({
      orgId: org.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      messageId: message.id,
      providerMessageId: "F123",
      providerAction: "files.uploadV2",
      providerResourceType: "file",
      actionIndex: 1,
      direction: "outbound",
    });

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, ts: "1700.01" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "agent@operations.test",
        password: "password12345",
        orgSlug: "message-operations",
      }),
    });
    const token = ((await login.json()) as { accessToken: string }).accessToken;
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const base = `/api/v1/dashboard/conversations/${conversation.id}/messages/${message.id}`;

    const edit = await app.request(base, {
      method: "PATCH",
      headers: { ...auth, "Idempotency-Key": "edit-1" },
      body: JSON.stringify({ plainText: "After" }),
    });
    expect(edit.status).toBe(202);
    await eventually(async () => {
      const [updated] = await store.db.select().from(messages).where(eq(messages.id, message.id));
      expect(updated?.plainText).toBe("After");
      expect(updated?.editedAt).toBeInstanceOf(Date);
    });

    const reaction = await app.request(`${base}/reactions`, {
      method: "PUT",
      headers: { ...auth, "Idempotency-Key": "reaction-1" },
      body: JSON.stringify({ emoji: "thumbsup" }),
    });
    expect(reaction.status).toBe(202);
    await eventually(async () => {
      expect(await store.db.select().from(reactions)).toMatchObject([
        { messageId: message.id, actorId: member.id, emoji: "thumbsup" },
      ]);
    });

    const listed = await app.request(
      `/api/v1/dashboard/conversations/${conversation.id}/messages`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const listedBody = (await listed.json()) as {
      items: Array<{ editedAt: string | null; deletedAt: string | null; reactions: unknown[] }>;
    };
    expect(listedBody.items[0]).toMatchObject({
      editedAt: expect.any(String),
      deletedAt: null,
      reactions: [{ actorType: "agent", actorId: member.id, emoji: "thumbsup" }],
    });

    const typing = await app.request(`/api/v1/dashboard/conversations/${conversation.id}/typing`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(typing.status).toBe(422);

    const deleted = await app.request(base, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "delete-1" },
    });
    expect(deleted.status).toBe(202);
    await eventually(async () => {
      const [updated] = await store.db.select().from(messages).where(eq(messages.id, message.id));
      expect(updated?.deletedAt).toBeInstanceOf(Date);
      expect(updated?.deliveryStatus).toBe("delivered");
    });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://slack.com/api/chat.update",
      "https://slack.com/api/reactions.add",
      "https://slack.com/api/chat.delete",
      "https://slack.com/api/files.delete",
    ]);
    await store.close();
  });

  it("publishes Widget typing and message mutations through the durable runtime", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-widget-operations-"));
    tempDirectories.push(directory);
    const databaseUrl = `file:${path.join(directory, "operations.db")}`;
    const store = createLibsqlStore({ url: databaseUrl });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "widget-operations", name: "Widget Operations" })
      .returning();
    if (!org) throw new Error("missing_org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const [account] = await store.db
      .insert(accounts)
      .values({
        email: "agent@widget-operations.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    if (!brand || !account) throw new Error("missing_fixture");
    const [member] = await store.db
      .insert(members)
      .values({ orgId: org.id, accountId: account.id, role: "admin", status: "active" })
      .returning();
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "widget",
        name: "Widget",
        externalAccountId: "widget-default",
        status: "active",
        credentials: sealChannelCredentials({}, authConfig.jwtSecret),
      })
      .returning();
    const [conversation] = await store.db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "widget-user-1",
      })
      .returning();
    if (!member || !connection || !conversation) throw new Error("missing_fixture");
    await store.db.insert(channelConversationLinks).values({
      orgId: org.id,
      brandId: brand.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      externalThreadId: conversation.id,
    });
    const [message] = await store.db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conversation.id,
        senderType: "agent",
        senderId: member.id,
        content: { type: "text", text: "Before" },
        plainText: "Before",
        deliveryStatus: "delivered",
      })
      .returning();
    if (!message) throw new Error("missing_message");
    await store.db.insert(channelMessageLinks).values({
      orgId: org.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      messageId: message.id,
      providerMessageId: message.id,
      providerResourceType: "message",
      actionIndex: 0,
      direction: "outbound",
    });

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const events: Array<{ type: string; message?: unknown }> = [];
    const unsubscribe = subscribeConversation(conversation.id, (event) => events.push(event));
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "agent@widget-operations.test",
        password: "password12345",
        orgSlug: "widget-operations",
      }),
    });
    const token = ((await login.json()) as { accessToken: string }).accessToken;
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const base = `/api/v1/dashboard/conversations/${conversation.id}/messages/${message.id}`;

    const typing = await app.request(`/api/v1/dashboard/conversations/${conversation.id}/typing`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(typing.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "typing",
        conversationId: conversation.id,
        actorType: "agent",
      }),
    );

    const edit = await app.request(base, {
      method: "PATCH",
      headers: { ...auth, "Idempotency-Key": "widget-edit-1" },
      body: JSON.stringify({ plainText: "After" }),
    });
    expect(edit.status).toBe(202);
    await eventually(async () => {
      const [updated] = await store.db.select().from(messages).where(eq(messages.id, message.id));
      expect(updated?.plainText).toBe("After");
      expect(updated?.editedAt).toBeInstanceOf(Date);
    });

    const reaction = await app.request(`${base}/reactions`, {
      method: "PUT",
      headers: { ...auth, "Idempotency-Key": "widget-reaction-1" },
      body: JSON.stringify({ emoji: "thumbsup" }),
    });
    expect(reaction.status).toBe(202);
    await eventually(async () => {
      expect(await store.db.select().from(reactions)).toMatchObject([
        { messageId: message.id, actorId: member.id, emoji: "thumbsup" },
      ]);
    });

    const deleted = await app.request(base, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "widget-delete-1" },
    });
    expect(deleted.status).toBe(202);
    await eventually(async () => {
      const [updated] = await store.db.select().from(messages).where(eq(messages.id, message.id));
      expect(updated?.deletedAt).toBeInstanceOf(Date);
      expect(events.filter((event) => event.type === "message.updated")).toHaveLength(3);
    });

    unsubscribe();
    expect(fetchMock).not.toHaveBeenCalled();
    await store.close();
  });
});

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
