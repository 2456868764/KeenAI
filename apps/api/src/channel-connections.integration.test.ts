import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  channelConnections,
  members,
  organizations,
} from "@keenai/storage/schema";
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

describe("channel connections", () => {
  it("stores credentials encrypted and never returns credential values", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "channel-org", name: "Channel Org" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await store.db
      .insert(accounts)
      .values({
        email: "owner@channel.test",
        name: "Owner",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await store.db.insert(members).values({
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
    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@channel.test",
        password: "password12345",
        orgSlug: "channel-org",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const saved = await app.request("/api/v1/dashboard/channel-connections/telegram", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        brandId: brand.id,
        name: "Telegram",
        credentials: { botToken: "super-secret-token" },
        settings: { mode: "webhook" },
      }),
    });
    expect(saved.status).toBe(200);
    const savedBody = await saved.text();
    expect(savedBody).not.toContain("super-secret-token");
    expect(savedBody).toContain("botToken");

    const [stored] = await store.db.select().from(channelConnections).limit(1);
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored?.credentials)).not.toContain("super-secret-token");

    const listed = await app.request(`/api/v1/dashboard/channel-connections?brandId=${brand.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      items: Array<{ configuredCredentialKeys: string[] }>;
    };
    expect(body.items[0]?.configuredCredentialKeys).toEqual(["botToken"]);
    await store.close();
  });
});
