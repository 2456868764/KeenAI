import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("IM multimodal integration", () => {
  it("ingests Telegram photo webhook into photo message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db.insert(organizations).values({ slug: "im", name: "IM" }).returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-im-telegram",
      ),
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

    const webhookRes = await app.request("/api/v1/webhooks/im/telegram?org=im", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 100,
          from: { id: 42, first_name: "Alex" },
          chat: { id: 9001, type: "private" },
          photo: [{ file_id: "photo-small", width: 90, height: 90, file_size: 500 }],
          caption: "Need help with billing",
        },
      }),
    });
    expect(webhookRes.status).toBe(202);
    const webhookBody = (await webhookRes.json()) as {
      accepted: boolean;
      created: boolean;
      message: { messageKind: string; plainText: string; attachments: unknown[] };
    };
    expect(webhookBody.accepted).toBe(true);
    expect(webhookBody.created).toBe(true);
    expect(webhookBody.message.messageKind).toBe("photo");
    expect(webhookBody.message.plainText).toBe("Need help with billing");
    expect(webhookBody.message.attachments).toHaveLength(1);

    await store.close();
  });

  it("plans Telegram outbound for agent photo reply", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "im-out", name: "IM Out" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const passwordHash = await hashPassword("keenai-demo-12");
    const [accountRow] = await db
      .insert(accounts)
      .values({ email: "owner@keenai.local", passwordHash, name: "Owner" })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-im-outbound",
      ),
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

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "im-out",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "telegram",
        channelId: "9001",
        subject: "Telegram support",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const presignRes = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "reply.png",
        contentType: "image/png",
        sizeBytes: PNG_1X1.byteLength,
      }),
    });
    const presigned = (await presignRes.json()) as { uploadUrl: string };
    const uploadPath = new URL(presigned.uploadUrl).pathname;
    const uploadRes = await app.request(uploadPath, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "image/png" },
      body: PNG_1X1,
    });
    const uploaded = (await uploadRes.json()) as { attachmentId: string };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "ai",
        plainText: "Here is the fix.",
        attachmentIds: [uploaded.attachmentId],
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as { message: { id: string } };

    const planRes = await app.request(
      `/api/v1/conversations/${conversation.id}/messages/${msgBody.message.id}/im-outbound`,
      { headers: auth },
    );
    expect(planRes.status).toBe(200);
    const planBody = (await planRes.json()) as {
      platform: string;
      targetId: string;
      actions: { method: string; caption?: string }[];
    };
    expect(planBody.platform).toBe("telegram");
    expect(planBody.targetId).toBe("9001");
    expect(planBody.actions.some((a) => a.method === "sendPhoto")).toBe(true);

    await store.close();
  });

  it("ingests Slack file_share webhook", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "slack", name: "Slack" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    requireRow(brandRow, "brand");

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-im-slack",
      ),
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

    const webhookRes = await app.request("/api/v1/webhooks/im/slack?org=slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "event_callback",
        event: {
          type: "message",
          subtype: "file_share",
          channel: "C555",
          user: "U777",
          ts: "1710000000.000100",
          files: [
            {
              id: "F1",
              name: "screenshot.png",
              mimetype: "image/png",
              size: 2048,
              url_private_download: "https://files.slack.com/test.png",
            },
          ],
        },
      }),
    });
    expect(webhookRes.status).toBe(202);
    const body = (await webhookRes.json()) as {
      message: { messageKind: string; attachments: unknown[] };
    };
    expect(body.message.messageKind).toBe("photo");
    expect(body.message.attachments).toHaveLength(1);

    await store.close();
  });
});
