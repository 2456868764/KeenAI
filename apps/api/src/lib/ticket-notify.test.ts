import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AuthConfig } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  channelConversationLinks,
  channelOutbox,
  conversations,
  messages,
  organizations,
  ticketConversations,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createLogger } from "../logger.js";
import { drainChannelDispatch } from "./channel-dispatch.js";
import { resetChannelPluginRegistryForTests } from "./channel-plugins.js";
import { notifyTicketStatusChange } from "./ticket-notify.js";
import { loadTicketMeta } from "./tickets.js";

const emailSend = vi.hoisted(() => vi.fn());
const tempDirs: string[] = [];

vi.mock("@keenai/channels-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keenai/channels-email")>();
  return {
    ...actual,
    createEmailChannelPlugin: () => ({
      ...actual.createEmailChannelPlugin(),
      send: emailSend,
    }),
  };
});

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 7_200,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
  smtp: {
    host: "smtp.example.test",
    port: 587,
    user: "support@example.test",
    pass: "secret",
    from: "support@example.test",
  },
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("ticket status notification", () => {
  beforeEach(() => {
    emailSend.mockReset();
    emailSend.mockResolvedValue({
      providerMessageIds: ["smtp-ticket-1"],
      acceptedAt: new Date(),
    });
    resetChannelPluginRegistryForTests();
  });

  it("delivers through the Email plugin and durable outbox, then reuses the thread", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-ticket-notify-"));
    tempDirs.push(directory);
    const databaseUrl = `file:${path.join(directory, "test.db")}`;
    const store = createLibsqlStore({ url: databaseUrl });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "ticket-mail", name: "Ticket Mail" })
      .returning();
    if (!org) throw new Error("org fixture failed");
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand fixture failed");
    const [type] = await db
      .insert(ticketTypes)
      .values({ orgId: org.id, name: "Customer", kind: "customer" })
      .returning();
    const [status] = await db
      .insert(ticketStatuses)
      .values({ orgId: org.id, name: "Resolved", category: "done" })
      .returning();
    if (!type || !status) throw new Error("ticket metadata fixture failed");
    const [sourceConversation] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId: "customer@example.test",
        channelType: "widget",
        channelId: "widget-ticket-source",
        subject: "Billing problem",
      })
      .returning();
    if (!sourceConversation) throw new Error("conversation fixture failed");
    const [ticketRow] = await db
      .insert(tickets)
      .values({
        orgId: org.id,
        typeId: type.id,
        statusId: status.id,
        title: "Billing problem",
        customerId: "customer@example.test",
      })
      .returning();
    if (!ticketRow) throw new Error("ticket fixture failed");
    await db.insert(ticketConversations).values({
      ticketId: ticketRow.id,
      conversationId: sourceConversation.id,
      relationship: "primary",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const ticket = await loadTicketMeta(db, ticketRow);

    const first = await notifyTicketStatusChange(db, authConfig, {
      orgId: org.id,
      ticket,
      statusName: "Resolved",
    });
    expect(first).toMatchObject({ sent: true, mode: "durable" });
    if (!first.sent) throw new Error("ticket notification was not queued");
    await drainChannelDispatch();

    const connections = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.channelType, "email"));
    expect(connections).toHaveLength(1);
    const notificationConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.channelType, "email"));
    expect(notificationConversations).toHaveLength(1);
    expect(notificationConversations[0]).toMatchObject({
      userId: "customer@example.test",
      brandId: brand.id,
    });
    const links = await db.select().from(channelConversationLinks);
    expect(links).toHaveLength(1);
    const outbox = await db.select().from(channelOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.status).toBe("completed");
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(emailSend.mock.calls[0]?.[0]).toMatchObject({
      channelType: "email",
      metadata: {
        to: "customer@example.test",
        subject: "Ticket update: Billing problem → Resolved",
      },
    });
    expect(emailSend.mock.calls[0]?.[0].metadata.html).toContain("View in portal");

    const second = await notifyTicketStatusChange(db, authConfig, {
      orgId: org.id,
      ticket: { ...ticket, conversationIds: [...ticket.conversationIds, first.conversationId] },
      statusName: "Resolved",
    });
    expect(second).toMatchObject({
      sent: true,
      mode: "durable",
      conversationId: first.conversationId,
    });
    await drainChannelDispatch();

    expect(
      await db.select().from(conversations).where(eq(conversations.channelType, "email")),
    ).toHaveLength(1);
    expect(
      await db.select().from(messages).where(eq(messages.conversationId, first.conversationId)),
    ).toHaveLength(2);
    expect(emailSend).toHaveBeenCalledTimes(2);

    await store.close();
  });

  it("returns a preview without creating a message when no Email connection exists", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });
    const [org] = await db
      .insert(organizations)
      .values({ slug: "ticket-preview", name: "Ticket Preview" })
      .returning();
    if (!org) throw new Error("org fixture failed");
    await db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const result = await notifyTicketStatusChange(
      db,
      { ...authConfig, smtp: undefined },
      {
        orgId: org.id,
        ticket: {
          id: "ticket-preview",
          orgId: org.id,
          typeId: "type-preview",
          typeName: null,
          title: "Preview ticket",
          description: null,
          statusId: null,
          statusName: "Open",
          priority: "normal",
          assigneeId: null,
          reporterId: null,
          customerId: "customer@example.test",
          customFields: {},
          dueDate: null,
          closedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          conversationIds: [],
        },
        statusName: "Open",
      },
    );

    expect(result).toMatchObject({
      sent: false,
      reason: "email_connection_not_configured",
    });
    expect(await db.select().from(messages)).toHaveLength(0);
    await store.close();
  });
});
