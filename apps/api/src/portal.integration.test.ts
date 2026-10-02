import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMagicLink, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  channelConnections,
  members,
  organizations,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

vi.mock("@keenai/channels-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keenai/channels-email")>();
  return {
    ...actual,
    pollImapMailboxes: vi.fn(),
  };
});

describe("email imap poll", () => {
  function testCtx(
    store: ReturnType<typeof createLibsqlStore>,
    env: ReturnType<typeof parseApiEnv>,
  ) {
    return {
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
    };
  }

  it("skips when no polling email connection is configured", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const { runEmailImapPoll } = await import("./lib/email-imap-poll.js");

    const result = await runEmailImapPoll(testCtx(store, env));
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("imap_connection_not_configured");
    await store.close();
  });

  it("polls each configured email connection", async () => {
    const { pollImapMailboxes } = await import("@keenai/channels-email");
    const pollMock = vi.mocked(pollImapMailboxes);
    pollMock.mockResolvedValue({ polled: 1, ingested: 1, oversized: 0, skipped: false });

    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    await db.insert(channelConnections).values({
      orgId: org.id,
      brandId: brand.id,
      channelType: "email",
      transport: "polling",
      name: "Support mailbox",
      externalAccountId: "support@example.com",
      credentials: {
        imapHost: "imap.example.com",
        imapUser: "inbox@example.com",
        imapPass: "secret",
      },
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });

    const { runEmailImapPoll } = await import("./lib/email-imap-poll.js");
    const result = await runEmailImapPoll(testCtx(store, env));

    expect(result.ingested).toBe(1);
    expect(result.connections).toBe(1);
    expect(pollMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", user: "inbox@example.com" }),
      undefined,
      expect.objectContaining({ onMessage: expect.any(Function) }),
    );
    await store.close();
  });
});

describe("portal integration", () => {
  it("lists customer tickets when portal public read is enabled", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo" })
      .returning();
    const org = requireRow(orgRow, "org");
    await db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const [typeRow] = await db
      .insert(ticketTypes)
      .values({ orgId: org.id, name: "Support", kind: "customer" })
      .returning();
    const type = requireRow(typeRow, "type");
    const [statusRow] = await db
      .insert(ticketStatuses)
      .values({ orgId: org.id, name: "Open", category: "active", isDefault: true })
      .returning();
    const status = requireRow(statusRow, "status");

    await db.insert(tickets).values({
      orgId: org.id,
      typeId: type.id,
      statusId: status.id,
      title: "Portal ticket",
      customerId: "customer@example.com",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      PORTAL_PUBLIC_READ: "true",
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

    const res = await app.request("/api/v1/portal/demo/tickets?customerId=customer%40example.com");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string }[] };
    expect(body.items.some((t) => t.title === "Portal ticket")).toBe(true);

    await store.close();
  });

  it("lists tickets via portal magic link JWT when public read is disabled", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo" })
      .returning();
    const org = requireRow(orgRow, "org");
    await db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const [typeRow] = await db
      .insert(ticketTypes)
      .values({ orgId: org.id, name: "Support", kind: "customer" })
      .returning();
    const type = requireRow(typeRow, "type");
    const [statusRow] = await db
      .insert(ticketStatuses)
      .values({ orgId: org.id, name: "Open", category: "active", isDefault: true })
      .returning();
    const status = requireRow(statusRow, "status");

    await db.insert(tickets).values({
      orgId: org.id,
      typeId: type.id,
      statusId: status.id,
      title: "Secure portal ticket",
      customerId: "customer@example.com",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      PORTAL_PUBLIC_READ: "false",
    });
    const authConfig = {
      jwtSecret: "test-secret-at-least-32-characters-long!!",
      accessTtlSec: 900,
      refreshTtlSec: 604_800,
      appUrl: "http://localhost:3000",
      portalAppUrl: "http://localhost:3002",
      portalAccessTtlSec: 604_800,
    };
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const denied = await app.request("/api/v1/portal/demo/tickets");
    expect(denied.status).toBe(401);

    const { token } = await createMagicLink(db, "customer@example.com");
    const verifyRes = await app.request("/api/v1/portal/demo/magic-link/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as { accessToken: string; customerId: string };
    expect(verifyBody.customerId).toBe("customer@example.com");

    const listRes = await app.request("/api/v1/portal/demo/tickets", {
      headers: { Authorization: `Bearer ${verifyBody.accessToken}` },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { items: { title: string }[] };
    expect(listBody.items.some((t) => t.title === "Secure portal ticket")).toBe(true);

    await store.close();
  });
});
