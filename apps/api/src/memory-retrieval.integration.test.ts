import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import {
  applyFastScoreToChunk,
  digestDailyForBrand,
  ingestConversationMessage,
} from "@keenai/memory-tree";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  conversations,
  members,
  memoryChunks,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

async function setupMemoryApiTest() {
  const store = createLibsqlStore({ url: ":memory:" });
  const db = store.db;
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/storage/migrations/libsql",
  );
  await migrate(db, { migrationsFolder });

  const [orgRow] = await db
    .insert(organizations)
    .values({ slug: "mret", name: "Memory Retrieval" })
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
    .values({ email: "retrieval@keenai.local", passwordHash, name: "Owner" })
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
      email: "retrieval@keenai.local",
      password: "keenai-demo-12",
      orgSlug: "mret",
    }),
  });
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  return { app, store, db, org, brand, auth: { Authorization: `Bearer ${accessToken}` } };
}

describe("memory retrieval integration", () => {
  it("returns conversation tree latest L0 leaves", async () => {
    const { app, store, brand, auth } = await setupMemoryApiTest();

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "mem-retrieval",
        subject: "Retrieval",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ senderType: "user", plainText: "Need help with billing." }),
    });

    const latestRes = await app.request(
      `/api/v1/memory/tree?scope=conversation&id=${conversation.id}&mode=latest`,
      { headers: auth },
    );
    expect(latestRes.status).toBe(200);
    const latestBody = (await latestRes.json()) as {
      tree: { levels: Array<{ level: number; nodes: Array<{ kind: string; body?: string }> }> };
    };
    expect(latestBody.tree.levels).toHaveLength(1);
    expect(latestBody.tree.levels[0]?.nodes).toHaveLength(1);
    expect(latestBody.tree.levels[0]?.nodes[0]?.kind).toBe("leaf");
    expect(latestBody.tree.levels[0]?.nodes[0]?.body).toContain("billing");

    await store.close();
  });

  it("returns drill-down summaries after buffer seal", async () => {
    const { app, store, brand, auth } = await setupMemoryApiTest();

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "mem-drill",
        subject: "Drill down",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const texts = [
      "Need help with billing.",
      "Order ORD-555 is delayed.",
      "Please escalate.",
      "Waiting on refund update.",
      "Can you confirm SLA terms?",
      "Customer prefers email contact.",
      "Issue started last Tuesday.",
      "Need manager callback please.",
    ];
    for (const plainText of texts) {
      await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ senderType: "user", plainText }),
      });
    }

    const drillRes = await app.request(
      `/api/v1/memory/tree?scope=conversation&id=${conversation.id}&mode=drill_down&level=1`,
      { headers: auth },
    );
    expect(drillRes.status).toBe(200);
    const drillBody = (await drillRes.json()) as {
      tree: { levels: Array<{ level: number; nodes: Array<{ kind: string }> }> };
    };
    expect(drillBody.tree.levels).toHaveLength(1);
    expect(drillBody.tree.levels[0]?.level).toBe(1);
    expect(drillBody.tree.levels[0]?.nodes.some((node) => node.kind === "summary")).toBe(true);
    expect(drillBody.tree.levels[0]?.nodes.some((node) => node.kind === "episode")).toBe(true);

    await store.close();
  });

  it("returns brand daily digest for a UTC date", async () => {
    const { app, store, db, org, brand, auth } = await setupMemoryApiTest();
    const dateUtc = "2026-05-23";

    const convRow = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "digest-api",
        status: "open",
      })
      .returning();
    const conv = requireRow(convRow[0], "conversation");

    const msgRow = await db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conv.id,
        senderType: "user",
        plainText: "Need help with enterprise pricing.",
        content: { type: "text", text: "Need help with enterprise pricing." },
      })
      .returning();
    const msg = requireRow(msgRow[0], "message");

    const ingest = await ingestConversationMessage(db, {
      orgId: org.id,
      brandId: brand.id,
      conversationId: conv.id,
      messageId: msg.id,
      senderType: "user",
      sentAt: new Date(`${dateUtc}T10:00:00.000Z`),
      plainText: "Need help with enterprise pricing.",
      isInternal: false,
    });
    await applyFastScoreToChunk(db, {
      chunkId: ingest.id,
      plainText: "Need help with enterprise pricing.",
      source: "conversation_message",
      senderType: "user",
    });
    await db
      .update(memoryChunks)
      .set({ createdAt: new Date(`${dateUtc}T10:00:00.000Z`) })
      .where(eq(memoryChunks.id, ingest.id));

    const digestResult = await digestDailyForBrand(db, {
      orgId: org.id,
      brandId: brand.id,
      dateUtc,
    });
    expect(digestResult.created).toBe(true);

    const digestRes = await app.request(
      `/api/v1/memory/digest?brandId=${brand.id}&date=${dateUtc}`,
      { headers: auth },
    );
    expect(digestRes.status).toBe(200);
    const digestBody = (await digestRes.json()) as {
      digest: { summary: string; dateUtc: string; keyEvents: string[] };
    };
    expect(digestBody.digest.dateUtc).toBe(dateUtc);
    expect(digestBody.digest.summary).toContain("enterprise pricing");
    expect(digestBody.digest.keyEvents.length).toBeGreaterThan(0);

    const missingRes = await app.request(
      `/api/v1/memory/digest?brandId=${brand.id}&date=2020-01-01`,
      { headers: auth },
    );
    expect(missingRes.status).toBe(404);

    await store.close();
  });
});
