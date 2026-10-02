import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  auditLogs,
  brands,
  channelConnections,
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { sealChannelCredentials } from "./lib/channel-secrets.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

afterEach(() => vi.unstubAllGlobals());

describe("WhatsApp template routes", () => {
  it("manages provider templates through an organization-scoped connection", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "template-org", name: "Template Org" })
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
        email: "owner@templates.test",
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
    const [connectionRow] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "whatsapp",
        externalAccountId: "phone-1",
        name: "WhatsApp",
        status: "active",
        transport: "webhook",
        credentials: sealChannelCredentials(
          {
            accessToken: "provider-token",
            wabaId: "900",
            phoneNumberId: "800",
            graphApiVersion: "v20.0",
          },
          authConfig.jwtSecret,
        ),
      })
      .returning();
    const connection = requireRow(connectionRow, "connection");
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
        email: "owner@templates.test",
        password: "password12345",
        orgSlug: "template-org",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "1001",
              name: "order_update",
              language: "en_US",
              status: "APPROVED",
              category: "UTILITY",
              components: [{ type: "BODY", text: "Ready" }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: "1002", status: "PENDING", category: "UTILITY" }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const base = `/api/v1/dashboard/channel-connections/${connection.id}/whatsapp/templates`;

    const listed = await app.request(base, { headers });
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(1);

    const created = await app.request(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "shipping_update",
        language: "en_US",
        category: "UTILITY",
        components: [{ type: "BODY", text: "Your order shipped." }],
      }),
    });
    expect(created.status).toBe(201);

    const updated = await app.request(`${base}/1002`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ components: [{ type: "BODY", text: "Shipped." }] }),
    });
    expect(updated.status).toBe(200);

    const deleted = await app.request(`${base}/1002?name=shipping_update`, {
      method: "DELETE",
      headers,
    });
    expect(deleted.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.every((call) => JSON.stringify(call[1]).includes("provider-token")),
    ).toBe(true);

    const audits = await store.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, connection.id));
    expect(audits.map((item) => item.action).sort()).toEqual([
      "channel.whatsapp_template.created",
      "channel.whatsapp_template.deleted",
      "channel.whatsapp_template.updated",
    ]);
  });
});
