import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
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

  it("skips when org slug is not configured", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const { runEmailImapPoll } = await import("./lib/email-imap-poll.js");

    const result = await runEmailImapPoll(testCtx(store, env));
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("imap_org_not_configured");
    await store.close();
  });

  it("calls pollImapMailboxes when org slug is configured", async () => {
    const { pollImapMailboxes } = await import("@keenai/channels-email");
    const pollMock = vi.mocked(pollImapMailboxes);
    pollMock.mockResolvedValue({ polled: 1, ingested: 1, skipped: false });

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

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      EMAIL_IMAP_ORG_SLUG: "demo",
      EMAIL_IMAP_HOST: "imap.example.com",
      EMAIL_IMAP_USER: "inbox@example.com",
    });

    const { runEmailImapPoll } = await import("./lib/email-imap-poll.js");
    const result = await runEmailImapPoll(testCtx(store, env));

    expect(result.ingested).toBe(1);
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
});
