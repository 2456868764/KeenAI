import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelIngressEvents,
  channelOutbox,
  conversations,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { insertMessage } from "./lib/conversations.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("durable channel runtime", () => {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { eventId: string; duplicate: boolean };
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const duplicateBody = (await duplicate.json()) as { eventId: string; duplicate: boolean };
    expect(duplicateBody).toMatchObject({ eventId: firstBody.eventId, duplicate: true });
    expect(await fixture.store.db.select().from(channelIngressEvents)).toHaveLength(1);
    expect(
      await fixture.store.db.select().from(messages).where(eq(messages.plainText, "Durable hello")),
    ).toHaveLength(1);
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
  const env = parseApiEnv({
    NODE_ENV: "production",
    DATABASE_URL: `file:${databasePath}`,
    APP_URL: "http://localhost:8090",
  });
  const app = createApp({
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
  });
  return { app, store, orgId: org.id, brandId: brand.id };
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
