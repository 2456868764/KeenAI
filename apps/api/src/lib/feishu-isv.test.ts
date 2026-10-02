import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { channelProviderAppStates } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { putChannelProviderAppState } from "./channel-provider-app-state.js";
import { resetProviderTokenCacheForTests } from "./channel-provider-tokens.js";
import { hydrateFeishuIsvCredentials } from "./feishu-isv.js";

const secret = "test-secret-at-least-32-characters-long!!";
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  resetProviderTokenCacheForTests();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Feishu ISV credential hydration", () => {
  it("hydrates only in memory from an encrypted app ticket", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-feishu-isv-"));
    directories.push(directory);
    const store = createLibsqlStore({ url: `file:${path.join(directory, "isv.db")}` });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../packages/storage/migrations/libsql",
      ),
    });
    await putChannelProviderAppState({
      store,
      provider: "feishu",
      appId: "cli_app",
      stateType: "app_ticket",
      payload: { appTicket: "secret-ticket" },
      secret,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { app_access_token: "app-token", expire: 7200 } }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { tenant_access_token: "tenant-token", expire: 7200 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const env = parseApiEnv({
      DATABASE_URL: `file:${path.join(directory, "isv.db")}`,
      FEISHU_ISV_APP_ID: "cli_app",
      FEISHU_ISV_APP_SECRET: "app-secret",
    });

    await expect(
      hydrateFeishuIsvCredentials({
        store,
        credentials: { appType: "isv", appId: "cli_app", tenantKey: "tenant-1" },
        secret,
        env,
        cacheScope: "connection-1",
      }),
    ).resolves.toEqual({
      appType: "isv",
      appId: "cli_app",
      tenantKey: "tenant-1",
      tenantAccessToken: "tenant-token",
    });
    const [state] = await store.db.select().from(channelProviderAppStates);
    const persisted = JSON.stringify(state?.encryptedPayload);
    expect(persisted).not.toContain("secret-ticket");
    expect(persisted).not.toContain("app-secret");
    expect(persisted).not.toContain("tenant-token");
  });

  it("rejects an expired app ticket", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-feishu-isv-expired-"));
    directories.push(directory);
    const store = createLibsqlStore({ url: `file:${path.join(directory, "isv.db")}` });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../packages/storage/migrations/libsql",
      ),
    });
    await putChannelProviderAppState({
      store,
      provider: "feishu",
      appId: "cli_app",
      stateType: "app_ticket",
      payload: { appTicket: "expired-ticket" },
      secret,
      expiresAt: new Date(Date.now() - 1),
    });
    const env = parseApiEnv({
      DATABASE_URL: `file:${path.join(directory, "isv.db")}`,
      FEISHU_ISV_APP_ID: "cli_app",
      FEISHU_ISV_APP_SECRET: "app-secret",
    });

    await expect(
      hydrateFeishuIsvCredentials({
        store,
        credentials: { appType: "isv", appId: "cli_app", tenantKey: "tenant-1" },
        secret,
        env,
        cacheScope: "connection-1",
      }),
    ).rejects.toThrow("feishu_isv_app_ticket_missing");
  });
});
