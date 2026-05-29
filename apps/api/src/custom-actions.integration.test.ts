import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
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

describe("custom actions integration", () => {
  it("supports CRUD for brand-scoped custom actions", async () => {
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

    const createRes = await app.request("/api/v1/custom-actions", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        name: "extend_trial",
        description: "Extend a customer trial",
        whenToUse: "When the user asks for more trial days",
        parametersSchema: {
          type: "object",
          properties: {
            user_id: { type: "string" },
            days: { type: "integer" },
          },
          required: ["user_id", "days"],
        },
        endpoint: "https://api.example.com/trial/extend/{{user_id}}",
        method: "POST",
        authType: "hmac",
        authSecretRef: "vault:extend-trial-hmac",
        dataAccess: { allowFields: ["status", "new_end_date"] },
      }),
    });
    expect(createRes.status).toBe(201);
    const { action: created } = (await createRes.json()) as {
      action: { id: string; name: string; authType: string };
    };
    expect(created.name).toBe("extend_trial");
    expect(created.authType).toBe("hmac");

    const listRes = await app.request(`/api/v1/custom-actions?brandId=${brand.id}`, {
      headers: auth,
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { items: Array<{ id: string }> };
    expect(listBody.items.some((item) => item.id === created.id)).toBe(true);

    const getRes = await app.request(`/api/v1/custom-actions/${created.id}`, { headers: auth });
    expect(getRes.status).toBe(200);

    const patchRes = await app.request(`/api/v1/custom-actions/${created.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Extend trial period for a user",
        enabled: false,
      }),
    });
    expect(patchRes.status).toBe(200);
    const { action: updated } = (await patchRes.json()) as {
      action: { enabled: boolean; description: string | null };
    };
    expect(updated.enabled).toBe(false);
    expect(updated.description).toBe("Extend trial period for a user");

    const deleteRes = await app.request(`/api/v1/custom-actions/${created.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleteRes.status).toBe(204);

    const missingRes = await app.request(`/api/v1/custom-actions/${created.id}`, {
      headers: auth,
    });
    expect(missingRes.status).toBe(404);

    await store.close();
  });

  it("executes http_direct custom actions with HMAC signing", async () => {
    vi.stubEnv("CUSTOM_ACTION_SECRET_EXTEND_TRIAL_HMAC", "super-secret");

    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme-exec", name: "Acme Exec" })
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
        email: "exec@acme.test",
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

    const login = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "exec@acme.test",
        password: "password12345",
        orgSlug: "acme-exec",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const createRes = await app.request("/api/v1/custom-actions", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        name: "extend_trial",
        endpoint: "https://api.example.com/trial/extend/{{user_id}}",
        method: "POST",
        authType: "hmac",
        authSecretRef: "vault:extend-trial-hmac",
        dataAccess: { allowFields: ["status", "new_end_date"] },
      }),
    });
    const { action } = (await createRes.json()) as { action: { id: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", new_end_date: "2026-06-01", secret: "hidden" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const executeRes = await app.request(`/api/v1/custom-actions/${action.id}/execute`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ parameters: { user_id: "user-1", days: 7 } }),
    });

    expect(executeRes.status).toBe(200);
    const executeBody = (await executeRes.json()) as {
      result: { ok: boolean; data: Record<string, unknown>; filtered: boolean };
    };
    expect(executeBody.result.ok).toBe(true);
    expect(executeBody.result.filtered).toBe(true);
    expect(executeBody.result.data).toEqual({ status: "ok", new_end_date: "2026-06-01" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/trial/extend/user-1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-keenai-signature": expect.stringMatching(/^t=\d+,v1=[a-f0-9]{64}$/),
        }),
      }),
    );

    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
    await store.close();
  });
});
