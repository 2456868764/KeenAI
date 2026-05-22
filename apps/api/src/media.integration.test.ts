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

const TINY_WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);

describe("media transcribe integration", () => {
  it("transcribes audio attachment and updates message plainText", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "voice", name: "Voice" })
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
      STT_PROVIDER: "stub",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-media-stt",
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
        orgSlug: "voice",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "voice-test",
        subject: "Voice note",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const presignRes = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "note.webm",
        contentType: "audio/webm",
        sizeBytes: TINY_WEBM.byteLength,
      }),
    });
    const presigned = (await presignRes.json()) as { uploadUrl: string };
    const uploadPath = new URL(presigned.uploadUrl).pathname;
    const uploadRes = await app.request(uploadPath, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "audio/webm" },
      body: TINY_WEBM,
    });
    const uploaded = (await uploadRes.json()) as { attachmentId: string };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentIds: [uploaded.attachmentId] }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as {
      message: {
        plainText: string;
        messageKind: string;
        attachments: { metadata?: { transcript?: string } }[];
      };
    };
    expect(msgBody.message.messageKind).toBe("voice");
    expect(msgBody.message.plainText).toContain("[Transcript stub]");
    expect(msgBody.message.attachments[0]?.metadata?.transcript).toContain("note.webm");

    await store.close();
  });
});
