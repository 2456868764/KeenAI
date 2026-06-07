import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
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
      (m) => m.sentVia === "workflow" && m.plainText === "Here is the guide",
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
});
