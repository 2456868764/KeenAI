import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, createWidgetUserHash, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  auditLogs,
  brands,
  conversations,
  members,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { widgetHmacSecret } from "./lib/widget.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

async function loginToken(app: ReturnType<typeof createApp>) {
  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "agent@acme.test",
      password: "password12345",
      orgSlug: "acme",
    }),
  });
  const tokens = (await login.json()) as { accessToken: string };
  return tokens.accessToken;
}

describe("workflow integration", () => {
  it("runs first_message workflow on first customer message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Welcome auto-reply",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [{ id: "reply", type: "send_message", plainText: "Hello from workflow!" }],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    const published = await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(published.status).toBe(200);

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "w1",
        subject: "Workflow test",
        initialMessage: { plainText: "Hi there" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const messages = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    expect(messages.status).toBe(200);
    const body = (await messages.json()) as { items: { plainText: string; sentVia?: string }[] };
    expect(body.items.some((m) => m.plainText === "Hello from workflow!")).toBe(true);
    expect(body.items.some((m) => m.sentVia === "workflow")).toBe(true);

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    expect(runsRes.status).toBe(200);
    const runsBody = (await runsRes.json()) as { items: { id: string; status: string }[] };
    expect(runsBody.items[0]?.status).toBe("completed");

    const runRes = await app.request(
      `/api/v1/workflows/${workflow.id}/runs/${runsBody.items[0]?.id}`,
      { headers: auth },
    );
    expect(runRes.status).toBe(200);
    const runBody = (await runRes.json()) as { run: { id: string; workflowId: string } };
    expect(runBody.run.id).toBe(runsBody.items[0]?.id);
    expect(runBody.run.workflowId).toBe(workflow.id);

    await store.close();
  });

  it("runs goto workflow blocks and skips the linear next block", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Goto target",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            { id: "jump", type: "goto", targetBlockId: "target" },
            { id: "skipped", type: "send_message", plainText: "Skipped by goto" },
            { id: "target", type: "send_message", plainText: "Reached goto target" },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };
    const published = await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(published.status).toBe(200);

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "goto-1",
        initialMessage: { plainText: "Hi" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const messagesRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    const messagesBody = (await messagesRes.json()) as { items: { plainText: string }[] };
    expect(messagesBody.items.some((message) => message.plainText === "Skipped by goto")).toBe(
      false,
    );
    expect(messagesBody.items.some((message) => message.plainText === "Reached goto target")).toBe(
      true,
    );

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    const runsBody = (await runsRes.json()) as {
      items: { steps: { blockId: string; type: string; status: string }[] }[];
    };
    expect(runsBody.items[0]?.steps.map((step) => step.blockId)).toEqual(["jump", "target"]);
    expect(runsBody.items[0]?.steps.every((step) => step.status === "ok")).toBe(true);

    await store.close();
  });

  it("runs new_messenger_conversation workflow when a visitor opens messenger without a message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Messenger opened",
        brandId: brand.id,
        definition: {
          trigger: "new_messenger_conversation",
          blocks: [{ id: "reply", type: "send_message", plainText: "How can we help?" }],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    const published = await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(published.status).toBe(200);

    const secret = widgetHmacSecret(env);
    const userId = "visitor-new-messenger-1";
    const userHash = createWidgetUserHash(secret, userId);
    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "acme",
        brandSlug: "default",
        user: { id: userId, userHash },
      }),
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as { accessToken: string };
    const widgetAuth = { Authorization: `Bearer ${session.accessToken}` };

    const convRes = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(convRes.status).toBe(201);
    const convBody = (await convRes.json()) as { conversation: { id: string }; created: boolean };
    expect(convBody.created).toBe(true);

    const messages = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      { headers: widgetAuth },
    );
    expect(messages.status).toBe(200);
    const messagesBody = (await messages.json()) as { items: { plainText: string }[] };
    expect(messagesBody.items.some((message) => message.plainText === "How can we help?")).toBe(
      true,
    );

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    expect(runsRes.status).toBe(200);
    const runsBody = (await runsRes.json()) as { items: { status: string }[] };
    expect(runsBody.items[0]?.status).toBe("completed");

    await store.close();
  });

  it("runs page_view workflow when widget page rules match", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Pricing page assist",
        brandId: brand.id,
        definition: {
          trigger: "page_view",
          pageRules: [{ urlOp: "contains", url: "/pricing", timeOnPageSec: 5 }],
          blocks: [{ id: "reply", type: "send_message", plainText: "Need help with pricing?" }],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    const published = await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(published.status).toBe(200);

    const secret = widgetHmacSecret(env);
    const userId = "visitor-page-view-1";
    const userHash = createWidgetUserHash(secret, userId);
    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "acme",
        brandSlug: "default",
        user: { id: userId, userHash },
      }),
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as { accessToken: string };
    const widgetAuth = { Authorization: `Bearer ${session.accessToken}` };

    const unmatched = await app.request("/api/v1/widget/page-view", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.test/docs",
        title: "Docs",
        timeOnPageSec: 30,
      }),
    });
    expect(unmatched.status).toBe(201);
    const unmatchedBody = (await unmatched.json()) as { conversation: { id: string } };

    const runsBefore = await app.request(`/api/v1/workflows/${workflow.id}/runs`, {
      headers: auth,
    });
    expect(runsBefore.status).toBe(200);
    const beforeBody = (await runsBefore.json()) as { items: unknown[] };
    expect(beforeBody.items).toHaveLength(0);

    const matched = await app.request("/api/v1/widget/page-view", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.test/pricing",
        title: "Pricing",
        timeOnPageSec: 5,
      }),
    });
    expect(matched.status).toBe(200);
    const matchedBody = (await matched.json()) as {
      conversation: { id: string };
      created: boolean;
    };
    expect(matchedBody.created).toBe(false);
    expect(matchedBody.conversation.id).toBe(unmatchedBody.conversation.id);

    const messages = await app.request(
      `/api/v1/widget/conversations/${matchedBody.conversation.id}/messages`,
      { headers: widgetAuth },
    );
    expect(messages.status).toBe(200);
    const messagesBody = (await messages.json()) as { items: { plainText: string }[] };
    expect(
      messagesBody.items.some((message) => message.plainText === "Need help with pricing?"),
    ).toBe(true);

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    expect(runsRes.status).toBe(200);
    const runsBody = (await runsRes.json()) as { items: { status: string }[] };
    expect(runsBody.items[0]?.status).toBe("completed");

    await store.close();
  });

  it("runs let_keeni_answer workflow block on first message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Keeni auto answer",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [{ id: "keeni", type: "let_keeni_answer", maxSteps: 5 }],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "w-keeni",
        subject: "Refund help",
        initialMessage: { plainText: "Please refund order 42" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const messages = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    expect(messages.status).toBe(200);
    const body = (await messages.json()) as { items: { plainText: string; sentVia?: string }[] };
    expect(body.items.some((m) => m.sentVia === "workflow" && m.plainText.includes("Keeni"))).toBe(
      true,
    );

    await store.close();
  });

  it("send_message workflow block delivers attachmentIds on first message", async () => {
    const PNG_1X1 = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );

    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        passwordHash: await hashPassword("password12345"),
        name: "Agent",
      })
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
        "../../data/test-workflow-attachments",
      ),
    });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const presignRes = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "guide.png",
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
    expect(uploadRes.status).toBe(200);
    const uploaded = (await uploadRes.json()) as { attachmentId: string };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Screenshot reply",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            {
              id: "reply",
              type: "send_message",
              plainText: "Here is the guide",
              attachmentIds: [uploaded.attachmentId],
            },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    const published = await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(published.status).toBe(200);

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "w-attach",
        subject: "Need guide",
        initialMessage: { plainText: "Can you send the guide?" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const messages = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    expect(messages.status).toBe(200);
    const body = (await messages.json()) as {
      items: { plainText: string; sentVia?: string; attachments?: { id: string }[] }[];
    };
    const workflowMsg = body.items.find(
      (m) => m.sentVia === "workflow" && m.plainText.includes("Here is the guide"),
    );
    expect(workflowMsg).toBeTruthy();
    expect(workflowMsg?.attachments?.some((a) => a.id === uploaded.attachmentId)).toBe(true);

    await store.close();
  });

  it("runs link_ticket and send_ticket_update workflow blocks", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const typesRes = await app.request("/api/v1/tickets/meta/types", { headers: auth });
    const typesBody = (await typesRes.json()) as { items: { id: string; kind: string }[] };
    const customerType = typesBody.items.find((t) => t.kind === "customer");

    const childRes = await app.request("/api/v1/tickets", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Linked child",
        typeId: customerType?.id,
      }),
    });
    const { ticket: childTicket } = (await childRes.json()) as { ticket: { id: string } };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Convert and link",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            { id: "convert", type: "convert_to_ticket", title: "Workflow ticket" },
            {
              id: "link",
              type: "link_ticket",
              childTicketId: childTicket.id,
              linkType: "relates",
            },
            { id: "notify", type: "send_ticket_update" },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "wf-ticket-link",
        subject: "Link me",
        initialMessage: { plainText: "Please track this" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const fromConv = await app.request("/api/v1/tickets/from-conversation", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    const { ticket: parentTicket } = (await fromConv.json()) as { ticket: { id: string } };

    const events = await app.request(`/api/v1/tickets/${parentTicket.id}/events`, {
      headers: auth,
    });
    expect(events.status).toBe(200);
    const eventsBody = (await events.json()) as { items: { eventType: string }[] };
    expect(eventsBody.items.some((e) => e.eventType === "ticket_linked")).toBe(true);

    const runs = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    expect(runs.status).toBe(200);
    const runsBody = (await runs.json()) as {
      items: { steps: { type: string; status: string }[] }[];
    };
    const stepTypes = runsBody.items.flatMap((run) => run.steps.map((s) => s.type));
    expect(stepTypes).toContain("convert_to_ticket");
    expect(stepTypes).toContain("link_ticket");
    expect(stepTypes).toContain("send_ticket_update");

    await store.close();
  });

  it("collect_data suspends until widget submits workflow input", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Collect email",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            {
              id: "collect",
              type: "collect_data",
              prompt: "What is your email?",
              allowFreeText: false,
              fields: [{ key: "email", label: "Email", required: true }],
            },
            { id: "thanks", type: "send_message", plainText: "Thanks, we will follow up!" },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const secret = widgetHmacSecret(env);
    const userId = "visitor-collect-1";
    const userHash = createWidgetUserHash(secret, userId);
    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "acme",
        brandSlug: "default",
        user: { id: userId, userHash, email: "visitor@test.local" },
      }),
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as { accessToken: string };
    const widgetAuth = { Authorization: `Bearer ${session.accessToken}` };

    const convRes = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ initialMessage: { plainText: "Hi" } }),
    });
    expect(convRes.status).toBe(201);
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    expect(runsRes.status).toBe(200);
    const runsBody = (await runsRes.json()) as {
      items: {
        id: string;
        status: string;
        steps: { type: string; output?: { awaitingInput?: boolean } }[];
      }[];
    };
    expect(runsBody.items[0]?.status).toBe("awaiting_input");
    expect(runsBody.items[0]?.steps.some((step) => step.output?.awaitingInput)).toBe(true);

    const resumeRes = await app.request(
      `/api/v1/widget/conversations/${conversation.id}/workflow-input`,
      {
        method: "POST",
        headers: { ...widgetAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowRunId: runsBody.items[0]?.id,
          blockId: "collect",
          attributes: { email: "visitor@test.local" },
        }),
      },
    );
    expect(resumeRes.status).toBe(200);

    const runsAfter = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    const afterBody = (await runsAfter.json()) as { items: { status: string }[] };
    expect(afterBody.items[0]?.status).toBe("completed");

    const messages = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    const msgBody = (await messages.json()) as { items: { plainText: string }[] };
    expect(msgBody.items.some((m) => m.plainText === "Thanks, we will follow up!")).toBe(true);

    await store.close();
  });

  it("reply_buttons suspends until widget clicks a button", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Reply buttons",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            {
              id: "buttons",
              type: "reply_buttons",
              prompt: "Need sales or support?",
              allowFreeText: false,
              buttons: [
                { id: "sales", label: "Sales", nextId: "sales-msg" },
                { id: "support", label: "Support", nextId: "support-msg" },
              ],
            },
            { id: "support-msg", type: "send_message", plainText: "Support is on the way." },
            { id: "sales-msg", type: "send_message", plainText: "Sales team will reach out." },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const secret = widgetHmacSecret(env);
    const userId = "visitor-buttons-1";
    const userHash = createWidgetUserHash(secret, userId);
    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "acme",
        brandSlug: "default",
        user: { id: userId, userHash },
      }),
    });
    const session = (await sessionRes.json()) as { accessToken: string };
    const widgetAuth = { Authorization: `Bearer ${session.accessToken}` };

    const convRes = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ initialMessage: { plainText: "Hello" } }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    const runsBody = (await runsRes.json()) as { items: { id: string; status: string }[] };
    expect(runsBody.items[0]?.status).toBe("awaiting_input");

    const resumeRes = await app.request(
      `/api/v1/widget/conversations/${conversation.id}/workflow-button`,
      {
        method: "POST",
        headers: { ...widgetAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowRunId: runsBody.items[0]?.id,
          blockId: "buttons",
          buttonId: "sales",
        }),
      },
    );
    expect(resumeRes.status).toBe(200);

    const messages = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    const msgBody = (await messages.json()) as { items: { plainText: string }[] };
    expect(msgBody.items.some((m) => m.plainText === "Sales team will reach out.")).toBe(true);
    expect(msgBody.items.some((m) => m.plainText === "Support is on the way.")).toBe(false);

    await store.close();
  });

  it("snooze block sets conversation status to snoozed", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Snooze on first message",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [{ id: "snooze", type: "snooze", minutes: 90 }],
        },
      }),
    });
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };
    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "snooze-1",
        initialMessage: { plainText: "Hi" },
      }),
    });
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const fetched = await app.request(`/api/v1/conversations/${conversation.id}`, {
      headers: auth,
    });
    expect(fetched.status).toBe(200);
    const fetchedBody = (await fetched.json()) as {
      conversation: { status: string; snoozedUntil?: string };
    };
    expect(fetchedBody.conversation.status).toBe("snoozed");
    expect(fetchedBody.conversation.snoozedUntil).toBeTruthy();

    await store.close();
  });

  it("reopen block restores conversation status and clears closed or snoozed timestamps", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Reopen on first message",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            { id: "snooze", type: "snooze", minutes: 90 },
            { id: "close", type: "close" },
            { id: "reopen", type: "reopen" },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };
    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "reopen-1",
        initialMessage: { plainText: "Hi" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const fetched = await app.request(`/api/v1/conversations/${conversation.id}`, {
      headers: auth,
    });
    expect(fetched.status).toBe(200);
    const fetchedBody = (await fetched.json()) as {
      conversation: { status: string; closedAt: string | null; snoozedUntil: string | null };
    };
    expect(fetchedBody.conversation.status).toBe("open");
    expect(fetchedBody.conversation.closedAt).toBeNull();
    expect(fetchedBody.conversation.snoozedUntil).toBeNull();

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    const runsBody = (await runsRes.json()) as {
      items: { steps: { blockId: string; type: string; status: string }[] }[];
    };
    expect(runsBody.items[0]?.steps.map((step) => step.type)).toEqual([
      "snooze",
      "close",
      "reopen",
    ]);
    expect(runsBody.items[0]?.steps.every((step) => step.status === "ok")).toBe(true);

    await store.close();
  });

  it("tag_conversation, add_note, and mark_priority blocks update the conversation", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Tag and note VIP conversations",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            {
              id: "note",
              type: "add_note",
              plainText: "Workflow internal note",
            },
            {
              id: "tag",
              type: "tag_conversation",
              tags: ["vip", "billing"],
              mode: "append",
            },
            {
              id: "priority",
              type: "mark_priority",
              priority: "urgent",
            },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };
    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "tag-1",
        tags: ["existing"],
        initialMessage: { plainText: "Hi" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as {
      conversation: { id: string };
    };

    const fetched = await app.request(`/api/v1/conversations/${conversation.id}`, {
      headers: auth,
    });
    expect(fetched.status).toBe(200);
    const fetchedBody = (await fetched.json()) as {
      conversation: { tags: string[]; priority: string };
    };
    expect(fetchedBody.conversation.tags).toEqual(["existing", "vip", "billing"]);
    expect(fetchedBody.conversation.priority).toBe("urgent");

    const noteRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    const workflowNote = noteRows.find((message) => message.plainText === "Workflow internal note");
    expect(workflowNote).toMatchObject({
      senderType: "agent",
      isInternal: true,
      sentVia: "workflow",
    });
    expect(workflowNote?.metadata).toMatchObject({
      source: "workflow_add_note",
      workflowId: workflow.id,
    });

    await store.close();
  });

  it("csat waitForRating suspends until widget posts rating", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "CSAT after chat",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [
            {
              id: "csat",
              type: "csat",
              prompt: "How did we do?",
              allowComment: true,
              waitForRating: true,
            },
            { id: "thanks", type: "send_message", plainText: "Thanks for your feedback!" },
          ],
        },
      }),
    });
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };
    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const secret = widgetHmacSecret(env);
    const userId = "visitor-csat-1";
    const userHash = createWidgetUserHash(secret, userId);
    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "acme",
        brandSlug: "default",
        user: { id: userId, userHash },
      }),
    });
    const session = (await sessionRes.json()) as { accessToken: string };
    const widgetAuth = { Authorization: `Bearer ${session.accessToken}` };

    const convRes = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ initialMessage: { plainText: "Hello" } }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const runsRes = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    const runsBody = (await runsRes.json()) as { items: { id: string; status: string }[] };
    expect(runsBody.items[0]?.status).toBe("awaiting_input");

    const ratingRes = await app.request(`/api/v1/widget/conversations/${conversation.id}/rating`, {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: 5,
        ratingComment: "Great support",
        workflowRunId: runsBody.items[0]?.id,
        blockId: "csat",
      }),
    });
    expect(ratingRes.status).toBe(200);

    const runsAfter = await app.request(`/api/v1/workflows/${workflow.id}/runs`, { headers: auth });
    const afterBody = (await runsAfter.json()) as { items: { status: string }[] };
    expect(afterBody.items[0]?.status).toBe("completed");

    const messages = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    const msgBody = (await messages.json()) as { items: { plainText: string }[] };
    expect(msgBody.items.some((m) => m.plainText === "Thanks for your feedback!")).toBe(true);

    await store.close();
  });

  it("manages workflow publish versions, rollback, dry-run, duplicate, and archive", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        passwordHash: await hashPassword("password12345"),
        name: "Agent",
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const templatesRes = await app.request("/api/v1/workflows/templates", { headers: auth });
    expect(templatesRes.status).toBe(200);
    const templatesBody = (await templatesRes.json()) as {
      items: {
        id: string;
        name: string;
        definition: {
          trigger: "first_message" | "customer_unresponsive";
          blocks: { id: string; type: string }[];
        };
      }[];
    };
    expect(templatesBody.items).toHaveLength(11);
    const keeniTemplate = templatesBody.items.find((item) => item.id === "tpl-keeni-answers-first");
    expect(keeniTemplate?.definition.blocks[0]).toMatchObject({
      id: "keeni_answer",
      type: "let_keeni_answer",
    });

    const templateCreateRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: keeniTemplate?.name,
        brandId: brand.id,
        definition: keeniTemplate?.definition,
      }),
    });
    expect(templateCreateRes.status).toBe(201);
    const templateCreateBody = (await templateCreateRes.json()) as { workflow: { id: string } };
    expect(templateCreateBody.workflow.id).toBeTruthy();

    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Lifecycle workflow",
        brandId: brand.id,
        definition: {
          trigger: "first_message",
          blocks: [{ id: "reply", type: "send_message", plainText: "Version one" }],
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { workflow: { id: string } };
    const workflowId = createBody.workflow.id;

    const publishOne = await app.request(`/api/v1/workflows/${workflowId}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(publishOne.status).toBe(200);
    const publishOneBody = (await publishOne.json()) as { version: { version: number } };
    expect(publishOneBody.version.version).toBe(1);

    const updateRes = await app.request(`/api/v1/workflows/${workflowId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        definition: {
          trigger: "first_message",
          blocks: [{ id: "reply", type: "send_message", plainText: "Version two" }],
        },
      }),
    });
    expect(updateRes.status).toBe(200);

    const publishTwo = await app.request(`/api/v1/workflows/${workflowId}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(publishTwo.status).toBe(200);
    const publishTwoBody = (await publishTwo.json()) as { version: { version: number } };
    expect(publishTwoBody.version.version).toBe(2);

    const versionsRes = await app.request(`/api/v1/workflows/${workflowId}/versions`, {
      headers: auth,
    });
    expect(versionsRes.status).toBe(200);
    const versionsBody = (await versionsRes.json()) as { items: { version: number }[] };
    expect(versionsBody.items.map((item) => item.version)).toEqual([2, 1]);

    const rollbackRes = await app.request(`/api/v1/workflows/${workflowId}/rollback/1`, {
      method: "POST",
      headers: auth,
    });
    expect(rollbackRes.status).toBe(200);
    const rollbackBody = (await rollbackRes.json()) as {
      workflow: { definition: { blocks: { plainText?: string }[] } };
    };
    expect(rollbackBody.workflow.definition.blocks[0]?.plainText).toBe("Version one");

    const testRes = await app.request(`/api/v1/workflows/${workflowId}/test`, {
      method: "POST",
      headers: auth,
    });
    expect(testRes.status).toBe(200);
    const testBody = (await testRes.json()) as {
      mode: string;
      result: { steps: { blockId: string; status: string }[] };
    };
    expect(testBody.mode).toBe("dry-run");
    expect(testBody.result.steps[0]).toMatchObject({ blockId: "reply", status: "ok" });

    const [shadowConversationRow] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "shadow-1",
        status: "closed",
        subject: "Closed conversation",
        closedAt: new Date(),
      })
      .returning();
    const shadowConversation = requireRow(shadowConversationRow, "shadow conversation");

    const shadowRes = await app.request(`/api/v1/workflows/${workflowId}/shadow`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1 }),
    });
    expect(shadowRes.status).toBe(200);
    const shadowBody = (await shadowRes.json()) as {
      mode: string;
      sampled: number;
      items: { conversationId: string; result: { steps: { blockId: string; status: string }[] } }[];
    };
    expect(shadowBody.mode).toBe("shadow");
    expect(shadowBody.sampled).toBe(1);
    expect(shadowBody.items[0]?.conversationId).toBe(shadowConversation.id);
    expect(shadowBody.items[0]?.result.steps[0]).toMatchObject({
      blockId: "reply",
      status: "ok",
    });

    const unpublishRes = await app.request(`/api/v1/workflows/${workflowId}/unpublish`, {
      method: "POST",
      headers: auth,
    });
    expect(unpublishRes.status).toBe(200);
    const unpublishBody = (await unpublishRes.json()) as { workflow: { status: string } };
    expect(unpublishBody.workflow.status).toBe("draft");

    const duplicateRes = await app.request(`/api/v1/workflows/${workflowId}/duplicate`, {
      method: "POST",
      headers: auth,
    });
    expect(duplicateRes.status).toBe(201);
    const duplicateBody = (await duplicateRes.json()) as {
      workflow: { id: string; name: string; status: string };
    };
    expect(duplicateBody.workflow.id).not.toBe(workflowId);
    expect(duplicateBody.workflow.name).toContain("copy");
    expect(duplicateBody.workflow.status).toBe("draft");

    const deleteRes = await app.request(`/api/v1/workflows/${workflowId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleteRes.status).toBe(204);

    const auditRows = await db.select().from(auditLogs);
    const workflowAuditRows = auditRows.filter((row) => row.resourceId === workflowId);
    expect(workflowAuditRows.map((row) => row.action).sort()).toEqual([
      "workflow.delete",
      "workflow.publish",
      "workflow.publish",
      "workflow.rollback",
      "workflow.unpublish",
    ]);
    expect(workflowAuditRows.every((row) => row.resourceType === "workflow")).toBe(true);
    expect(workflowAuditRows.every((row) => row.actorType === "account")).toBe(true);
    expect(workflowAuditRows.every((row) => row.actorId === account.id)).toBe(true);
    const publishedVersions = workflowAuditRows
      .filter((row) => row.action === "workflow.publish")
      .map((row) => (row.changes as { version?: { version: number } } | null)?.version?.version)
      .sort();
    expect(publishedVersions).toEqual([1, 2]);

    const listRes = await app.request("/api/v1/workflows", { headers: auth });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { items: { id: string }[] };
    expect(listBody.items.some((item) => item.id === workflowId)).toBe(false);
    expect(listBody.items.some((item) => item.id === duplicateBody.workflow.id)).toBe(true);

    await store.close();
  });

  it("runs published webhook and custom event trigger workflows for an authorized conversation", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        passwordHash: await hashPassword("password12345"),
        name: "Agent",
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });
    const [conversationRow] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "api",
        channelId: "crm-1",
        status: "open",
        subject: "CRM webhook target",
      })
      .returning();
    const conversation = requireRow(conversationRow, "conversation");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Webhook VIP tag",
        brandId: brand.id,
        definition: {
          trigger: "webhook",
          blocks: [{ id: "tag_vip", type: "tag_conversation", tags: ["vip"], mode: "append" }],
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { workflow: { id: string; trigger: string } };
    expect(createBody.workflow.trigger).toBe("webhook");

    const publishRes = await app.request(`/api/v1/workflows/${createBody.workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });
    expect(publishRes.status).toBe(200);

    const eventCreateRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Churn event tag",
        brandId: brand.id,
        definition: {
          trigger: "event_match",
          eventName: "app/subscription.churned",
          blocks: [
            {
              id: "tag_churn",
              type: "tag_conversation",
              tags: ["churn-risk"],
              mode: "append",
            },
          ],
        },
      }),
    });
    expect(eventCreateRes.status).toBe(201);
    const eventCreateBody = (await eventCreateRes.json()) as {
      workflow: { id: string; trigger: string };
    };
    expect(eventCreateBody.workflow.trigger).toBe("event_match");

    const eventPublishRes = await app.request(
      `/api/v1/workflows/${eventCreateBody.workflow.id}/publish`,
      {
        method: "POST",
        headers: auth,
      },
    );
    expect(eventPublishRes.status).toBe(200);

    const scheduleCreateRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Scheduled VIP survey",
        brandId: brand.id,
        definition: {
          trigger: "schedule",
          cron: "*/60 * * * *",
          audience: {
            match: "all",
            rules: [{ field: "tags", op: "contains", value: "vip" }],
          },
          blocks: [
            {
              id: "tag_scheduled",
              type: "tag_conversation",
              tags: ["scheduled-survey"],
              mode: "append",
            },
          ],
        },
      }),
    });
    expect(scheduleCreateRes.status).toBe(201);
    const scheduleCreateBody = (await scheduleCreateRes.json()) as {
      workflow: { id: string; trigger: string };
    };
    expect(scheduleCreateBody.workflow.trigger).toBe("schedule");

    const schedulePublishRes = await app.request(
      `/api/v1/workflows/${scheduleCreateBody.workflow.id}/publish`,
      {
        method: "POST",
        headers: auth,
      },
    );
    expect(schedulePublishRes.status).toBe(200);

    const triggerRes = await app.request("/api/v1/workflows/webhooks/trigger", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        conversationId: conversation.id,
        eventName: "crm/contact.updated",
        payload: { tier: "vip" },
      }),
    });
    expect(triggerRes.status).toBe(200);
    const triggerBody = (await triggerRes.json()) as {
      mode: string;
      eventName: string;
      triggered: number;
      runs: { workflowId: string; status: string }[];
    };
    expect(triggerBody).toMatchObject({
      mode: "webhook",
      eventName: "crm/contact.updated",
      triggered: 1,
    });
    expect(triggerBody.runs[0]).toMatchObject({
      workflowId: createBody.workflow.id,
      status: "completed",
    });

    const unmatchedEventRes = await app.request("/api/v1/workflows/events/trigger", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        conversationId: conversation.id,
        eventName: "app/subscription.renewed",
        payload: { plan: "team" },
      }),
    });
    expect(unmatchedEventRes.status).toBe(200);
    const unmatchedEventBody = (await unmatchedEventRes.json()) as {
      mode: string;
      eventName: string;
      triggered: number;
    };
    expect(unmatchedEventBody).toMatchObject({
      mode: "event_match",
      eventName: "app/subscription.renewed",
      triggered: 0,
    });

    const matchedEventRes = await app.request("/api/v1/workflows/events/trigger", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        conversationId: conversation.id,
        eventName: "app/subscription.churned",
        payload: { plan: "team" },
      }),
    });
    expect(matchedEventRes.status).toBe(200);
    const matchedEventBody = (await matchedEventRes.json()) as {
      mode: string;
      eventName: string;
      triggered: number;
      runs: { workflowId: string; status: string }[];
    };
    expect(matchedEventBody).toMatchObject({
      mode: "event_match",
      eventName: "app/subscription.churned",
      triggered: 1,
    });
    expect(matchedEventBody.runs[0]).toMatchObject({
      workflowId: eventCreateBody.workflow.id,
      status: "completed",
    });

    const scheduleScanRes = await app.request("/api/v1/workflows/jobs/scan-scheduled", {
      method: "POST",
      headers: auth,
    });
    expect(scheduleScanRes.status).toBe(200);
    const scheduleScanBody = (await scheduleScanRes.json()) as {
      mode: string;
      triggered: number;
      workflows: number;
      runs: string[];
    };
    expect(scheduleScanBody).toMatchObject({
      mode: "sync",
      triggered: 1,
      workflows: 1,
    });
    expect(scheduleScanBody.runs).toHaveLength(1);

    const updatedConversations = await db.select().from(conversations);
    const updated = updatedConversations.find((item) => item.id === conversation.id);
    expect(updated?.tags).toContain("vip");
    expect(updated?.tags).toContain("churn-risk");
    expect(updated?.tags).toContain("scheduled-survey");

    await store.close();
  });

  it("runs conversation message, state, and assignment workflow triggers", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        passwordHash: await hashPassword("password12345"),
        name: "Agent",
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });
    const [conversationRow] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "conversation-trigger-1",
        status: "open",
        priority: "high",
        subject: "Conversation trigger target",
      })
      .returning();
    const conversation = requireRow(conversationRow, "conversation");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    async function createAndPublishWorkflow(input: {
      name: string;
      trigger: string;
      blocks: unknown[];
    }) {
      const createRes = await app.request("/api/v1/workflows", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          brandId: brand.id,
          definition: {
            trigger: input.trigger,
            blocks: input.blocks,
          },
        }),
      });
      expect(createRes.status).toBe(201);
      const createBody = (await createRes.json()) as { workflow: { id: string } };
      const publishRes = await app.request(`/api/v1/workflows/${createBody.workflow.id}/publish`, {
        method: "POST",
        headers: auth,
      });
      expect(publishRes.status).toBe(200);
      return createBody.workflow.id;
    }

    const anyMessageWorkflowId = await createAndPublishWorkflow({
      name: "Any customer message",
      trigger: "any_message",
      blocks: [{ id: "reply", type: "send_message", plainText: "Customer message received" }],
    });
    const teammateWorkflowId = await createAndPublishWorkflow({
      name: "Teammate reply",
      trigger: "teammate_message",
      blocks: [
        {
          id: "tag_teammate",
          type: "tag_conversation",
          tags: ["teammate-replied"],
          mode: "append",
        },
      ],
    });
    const teammateNoteWorkflowId = await createAndPublishWorkflow({
      name: "Teammate note",
      trigger: "teammate_added_note",
      blocks: [
        {
          id: "tag_teammate_note",
          type: "tag_conversation",
          tags: ["teammate-note"],
          mode: "append",
        },
      ],
    });
    const stateWorkflowId = await createAndPublishWorkflow({
      name: "State changed",
      trigger: "conversation_state_changed",
      blocks: [
        {
          id: "closed_branch",
          type: "branches",
          branches: [
            {
              condition: { field: "conversationStatus", op: "eq", value: "closed" },
              nextId: "tag_closed",
            },
          ],
          elseNextId: null,
        },
        {
          id: "tag_closed",
          type: "tag_conversation",
          tags: ["state-closed"],
          mode: "append",
        },
      ],
    });
    const assignedMemberWorkflowId = await createAndPublishWorkflow({
      name: "Assigned to member",
      trigger: "assigned_to_member",
      blocks: [
        {
          id: "tag_assigned_member",
          type: "tag_conversation",
          tags: ["assigned-member"],
          mode: "append",
        },
      ],
    });
    const assignedTeamWorkflowId = await createAndPublishWorkflow({
      name: "Assigned to team",
      trigger: "assigned_to_team",
      blocks: [
        {
          id: "tag_assigned_team",
          type: "tag_conversation",
          tags: ["assigned-team"],
          mode: "append",
        },
      ],
    });

    const customerMessage = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        plainText: "Customer asks for help",
        senderType: "user",
      }),
    });
    expect(customerMessage.status).toBe(201);

    const teammateMessage = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        plainText: "Agent is handling this",
        senderType: "agent",
      }),
    });
    expect(teammateMessage.status).toBe(201);

    const teammateNote = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        plainText: "Internal investigation note",
        senderType: "agent",
        isInternal: true,
      }),
    });
    expect(teammateNote.status).toBe(201);

    const closeRes = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closeRes.status).toBe(200);

    const assignMemberRes = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: "member-target-1" }),
    });
    expect(assignMemberRes.status).toBe(200);

    const assignTeamRes = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: "team-target-1" }),
    });
    expect(assignTeamRes.status).toBe(200);

    const messagesRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    expect(messagesRes.status).toBe(200);
    const messagesBody = (await messagesRes.json()) as {
      items: { plainText: string; sentVia?: string }[];
    };
    expect(
      messagesBody.items.some(
        (message) =>
          message.sentVia === "workflow" && message.plainText === "Customer message received",
      ),
    ).toBe(true);

    const [updatedConversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    expect(updatedConversation?.tags).toEqual(
      expect.arrayContaining([
        "teammate-replied",
        "teammate-note",
        "state-closed",
        "assigned-member",
        "assigned-team",
      ]),
    );
    expect(updatedConversation?.assigneeId).toBe("member-target-1");
    expect(updatedConversation?.teamId).toBe("team-target-1");

    for (const workflowId of [
      anyMessageWorkflowId,
      teammateWorkflowId,
      teammateNoteWorkflowId,
      stateWorkflowId,
      assignedMemberWorkflowId,
      assignedTeamWorkflowId,
    ]) {
      const runsRes = await app.request(`/api/v1/workflows/${workflowId}/runs`, {
        headers: auth,
      });
      expect(runsRes.status).toBe(200);
      const runsBody = (await runsRes.json()) as { items: { status: string }[] };
      expect(runsBody.items[0]?.status).toBe("completed");
    }

    await store.close();
  });

  it("runs ticket created and ticket state changed workflow triggers for linked conversations", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        passwordHash: await hashPassword("password12345"),
        name: "Agent",
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });
    const [conversationRow] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "messenger",
        channelId: "ticket-trigger-1",
        status: "open",
        subject: "Ticket trigger target",
      })
      .returning();
    const conversation = requireRow(conversationRow, "conversation");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    async function createAndPublishWorkflow(input: {
      name: string;
      trigger: string;
      tags: string[];
    }) {
      const createRes = await app.request("/api/v1/workflows", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          brandId: brand.id,
          definition: {
            trigger: input.trigger,
            blocks: [
              {
                id: "tag",
                type: "tag_conversation",
                tags: input.tags,
                mode: "append",
              },
            ],
          },
        }),
      });
      expect(createRes.status).toBe(201);
      const createBody = (await createRes.json()) as { workflow: { id: string } };
      const publishRes = await app.request(`/api/v1/workflows/${createBody.workflow.id}/publish`, {
        method: "POST",
        headers: auth,
      });
      expect(publishRes.status).toBe(200);
      return createBody.workflow.id;
    }

    const createdWorkflowId = await createAndPublishWorkflow({
      name: "Ticket created tag",
      trigger: "ticket_created",
      tags: ["ticket-created"],
    });
    const stateWorkflowId = await createAndPublishWorkflow({
      name: "Ticket state tag",
      trigger: "ticket_state_changed",
      tags: ["ticket-state-changed"],
    });

    const ticketRes = await app.request("/api/v1/tickets/from-conversation", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        title: "Workflow linked ticket",
      }),
    });
    expect(ticketRes.status).toBe(201);
    const ticketBody = (await ticketRes.json()) as { ticket: { id: string } };

    const statusesRes = await app.request("/api/v1/tickets/meta/statuses", { headers: auth });
    expect(statusesRes.status).toBe(200);
    const statusesBody = (await statusesRes.json()) as {
      items: { id: string; category: string; isDefault?: boolean }[];
    };
    const nextStatus =
      statusesBody.items.find((status) => status.category === "done") ??
      statusesBody.items.find((status) => !status.isDefault);
    expect(nextStatus?.id).toBeTruthy();

    const statusRes = await app.request(`/api/v1/tickets/${ticketBody.ticket.id}/status`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ statusId: nextStatus?.id }),
    });
    expect(statusRes.status).toBe(200);

    const [updatedConversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    expect(updatedConversation?.tags).toEqual(
      expect.arrayContaining(["ticket-created", "ticket-state-changed"]),
    );

    for (const workflowId of [createdWorkflowId, stateWorkflowId]) {
      const runsRes = await app.request(`/api/v1/workflows/${workflowId}/runs`, {
        headers: auth,
      });
      expect(runsRes.status).toBe(200);
      const runsBody = (await runsRes.json()) as { items: { status: string }[] };
      expect(runsBody.items[0]?.status).toBe("completed");
    }

    await store.close();
  });
});
