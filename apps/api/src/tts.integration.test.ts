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

describe("text-to-speech integration", () => {
  it("synthesizes audio and delivers voice outbound via agentOutboundText", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "tts", name: "TTS" })
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
      TTS_PROVIDER: "stub",
      UPLOAD_DIR: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/test-tts"),
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
        orgSlug: "tts",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const ttsRes = await app.request("/api/v1/tools/text-to-speech", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Your order has shipped." }),
    });
    expect(ttsRes.status).toBe(201);
    const ttsBody = (await ttsRes.json()) as {
      attachmentId: string;
      storageKey: string;
      contentType: string;
      provider: string;
      agentOutboundText: string;
    };
    expect(ttsBody.provider).toBe("stub");
    expect(ttsBody.contentType).toContain("audio/");
    expect(ttsBody.agentOutboundText).toContain(`MEDIA:${ttsBody.storageKey}`);
    expect(ttsBody.agentOutboundText).toContain("[[audio_as_voice]]");

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "tts-out",
        subject: "Voice reply",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "ai",
        agentOutboundText: ttsBody.agentOutboundText,
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as {
      message: {
        messageKind: string;
        attachments: { id: string; contentType: string | null; metadata?: { source?: string } }[];
      };
    };
    expect(msgBody.message.messageKind).toBe("voice");
    expect(msgBody.message.attachments).toHaveLength(1);
    expect(msgBody.message.attachments[0]?.id).toBe(ttsBody.attachmentId);
    expect(msgBody.message.attachments[0]?.contentType).toContain("audio/");
    expect(msgBody.message.attachments[0]?.metadata?.source).toBe("agent_tool");

    const contentRes = await app.request(`/api/v1/attachments/${ttsBody.attachmentId}/content`, {
      headers: auth,
    });
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers.get("content-type")).toContain("audio/");

    await store.close();
  });
});
