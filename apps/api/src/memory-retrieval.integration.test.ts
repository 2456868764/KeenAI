import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import {
  applyFastScoreToChunk,
  digestDailyForBrand,
  ingestConversationMessage,
  processAdmittedChunk,
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

  it("returns assembled agent memory context by scope", async () => {
    const { app, store, db, org, brand, auth } = await setupMemoryApiTest();
    const dateUtc = "2026-05-26";

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "ctx-api",
        subject: "Context API",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "user",
        plainText: "Enterprise pricing question.",
      }),
    });

    const convCtxRes = await app.request(
      `/api/v1/memory/context?conversationId=${conversation.id}`,
      { headers: auth },
    );
    expect(convCtxRes.status).toBe(200);
    const convCtx = (await convCtxRes.json()) as { context: { scope: string; applied: boolean } };
    expect(convCtx.context.scope).toBe("conversation");

    const chunkRows = await db.select().from(memoryChunks).where(eq(memoryChunks.orgId, org.id));
    const chunk = requireRow(chunkRows[0], "memory chunk");
    await db
      .update(memoryChunks)
      .set({
        lifecycle: "admitted",
        createdAt: new Date(`${dateUtc}T10:00:00.000Z`),
      })
      .where(eq(memoryChunks.id, chunk.id));
    await digestDailyForBrand(db, { orgId: org.id, brandId: brand.id, dateUtc });

    const dailyCtxRes = await app.request(
      `/api/v1/memory/context?conversationId=${conversation.id}&instruction=${encodeURIComponent("今天 support 概况")}&date=${dateUtc}`,
      { headers: auth },
    );
    expect(dailyCtxRes.status).toBe(200);
    const dailyCtx = (await dailyCtxRes.json()) as {
      context: { scope: string; text: string };
    };
    expect(dailyCtx.context.scope).toBe("brand_daily");
    expect(dailyCtx.context.text).toContain("Brand daily digest");

    await store.close();
  });

  it("returns customer topic tree when user is hot", async () => {
    const { app, store, db, brand, auth } = await setupMemoryApiTest();
    const userId = "user_topic_api";

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        userId,
        channelType: "messenger",
        channelId: "topic-api",
        subject: "Topic API",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    for (const plainText of ["Need help with billing.", "Follow-up on my refund."]) {
      await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ senderType: "user", plainText }),
      });
    }

    const chunkRows = await db.select().from(memoryChunks);
    for (const chunk of chunkRows) {
      await processAdmittedChunk(db, {
        orgId: chunk.orgId,
        brandId: chunk.brandId,
        chunkId: chunk.id,
      });
    }

    const treeRes = await app.request(
      `/api/v1/memory/tree?scope=customer&id=${userId}&brandId=${brand.id}`,
      { headers: auth },
    );
    expect(treeRes.status).toBe(200);
    const treeBody = (await treeRes.json()) as {
      tree: { scope: string; levels: Array<{ nodes: unknown[] }> };
    };
    expect(treeBody.tree.scope).toBe("customer");
    expect(treeBody.tree.levels[0]?.nodes.length).toBeGreaterThan(0);

    const customerCtxRes = await app.request(
      `/api/v1/memory/context?conversationId=${conversation.id}&instruction=${encodeURIComponent("这个客户之前说过什么")}`,
      { headers: auth },
    );
    expect(customerCtxRes.status).toBe(200);
    const customerCtx = (await customerCtxRes.json()) as {
      context: { scope: string; text: string };
    };
    expect(customerCtx.context.scope).toBe("customer");
    expect(customerCtx.context.text).toContain("Customer topic buffer");

    await store.close();
  });

  it("returns explorer stats and search hits", async () => {
    const { app, store, db, org, brand, auth } = await setupMemoryApiTest();

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "explorer-api",
        subject: "Explorer",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "user",
        plainText: "Unique billing keyword explorer-test.",
      }),
    });

    const chunkRows = await db.select().from(memoryChunks);
    for (const chunk of chunkRows) {
      await processAdmittedChunk(db, {
        orgId: org.id,
        brandId: brand.id,
        chunkId: chunk.id,
      });
    }

    const statsRes = await app.request(`/api/v1/memory/stats?brandId=${brand.id}`, {
      headers: auth,
    });
    expect(statsRes.status).toBe(200);
    const statsBody = (await statsRes.json()) as {
      stats: { chunkCount: number };
      hotTopics: unknown[];
    };
    expect(statsBody.stats.chunkCount).toBeGreaterThan(0);

    const searchRes = await app.request(
      `/api/v1/memory/search?brandId=${brand.id}&q=billing&scope=conversation`,
      { headers: auth },
    );
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as {
      results: { hits: Array<{ body: string }> };
    };
    expect(searchBody.results.hits.length).toBeGreaterThan(0);
    expect(searchBody.results.hits[0]?.body.toLowerCase()).toContain("billing");

    await store.close();
  });

  it("returns channel-scoped source tree for slack", async () => {
    const { app, store, db, org, brand, auth } = await setupMemoryApiTest();
    const channelId = "C_SLACK_SUPPORT";

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "slack",
        channelId,
        subject: "Slack support",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "user",
        plainText: "Slack channel memory keyword alpha.",
      }),
    });

    const chunkRows = await db.select().from(memoryChunks);
    for (const chunk of chunkRows) {
      await processAdmittedChunk(db, {
        orgId: org.id,
        brandId: brand.id,
        chunkId: chunk.id,
      });
    }

    const treeRes = await app.request(
      `/api/v1/memory/tree?scope=channel&channelType=slack&id=${channelId}&brandId=${brand.id}`,
      { headers: auth },
    );
    expect(treeRes.status).toBe(200);
    const treeBody = (await treeRes.json()) as {
      tree: { scope: string; channelId: string; levels: Array<{ nodes: unknown[] }> };
    };
    expect(treeBody.tree.scope).toBe("channel");
    expect(treeBody.tree.channelId).toBe(channelId);
    expect(treeBody.tree.levels[0]?.nodes.length).toBeGreaterThan(0);

    await store.close();
  });

  it("reports agentmemory health status", async () => {
    const { app, store, brand, auth } = await setupMemoryApiTest();

    const healthRes = await app.request("/api/v1/memory/agentmemory/health", { headers: auth });
    expect(healthRes.status).toBe(200);
    const body = (await healthRes.json()) as {
      agentmemory: { reachable: boolean; syncEnabled: boolean; url: string };
    };
    expect(body.agentmemory.url).toContain("3111");
    expect(typeof body.agentmemory.reachable).toBe("boolean");

    await store.close();
  });
});
