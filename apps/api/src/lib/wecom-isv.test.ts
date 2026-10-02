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
import { hydrateWeComIsvCredentials } from "./wecom-isv.js";

const secret = "test-secret-at-least-32-characters-long!!";
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  resetProviderTokenCacheForTests();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("WeCom ISV credential hydration", () => {
  it("hydrates a corp token only in memory from encrypted suite state", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-wecom-isv-"));
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
      provider: "wecom",
      appId: "suite-1",
      stateType: "suite_ticket",
      payload: { suiteTicket: "secret-suite-ticket" },
      secret,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, suite_access_token: "suite-token", expires_in: 7200 }),
      )
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, access_token: "corp-token", expires_in: 7200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const env = parseApiEnv({
      DATABASE_URL: `file:${path.join(directory, "isv.db")}`,
      WECOM_SUITE_ID: "suite-1",
      WECOM_SUITE_SECRET: "suite-secret",
    });

    await expect(
      hydrateWeComIsvCredentials({
        store,
        credentials: {
          appType: "isv",
          suiteId: "suite-1",
          corpId: "corp-1",
          permanentCode: "permanent-code",
        },
        secret,
        env,
        cacheScope: "connection-1",
      }),
    ).resolves.toEqual({
      appType: "isv",
      suiteId: "suite-1",
      corpId: "corp-1",
      permanentCode: "permanent-code",
      accessToken: "corp-token",
    });
    const [state] = await store.db.select().from(channelProviderAppStates);
    const persisted = JSON.stringify(state?.encryptedPayload);
    expect(persisted).not.toContain("secret-suite-ticket");
    expect(persisted).not.toContain("suite-secret");
    expect(persisted).not.toContain("suite-token");
    expect(persisted).not.toContain("corp-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an expired suite ticket", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-wecom-isv-expired-"));
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
      provider: "wecom",
      appId: "suite-1",
      stateType: "suite_ticket",
      payload: { suiteTicket: "expired-ticket" },
      secret,
      expiresAt: new Date(Date.now() - 1),
    });
    const env = parseApiEnv({
      DATABASE_URL: `file:${path.join(directory, "isv.db")}`,
      WECOM_SUITE_ID: "suite-1",
      WECOM_SUITE_SECRET: "suite-secret",
    });

    await expect(
      hydrateWeComIsvCredentials({
        store,
        credentials: {
          appType: "isv",
          suiteId: "suite-1",
          corpId: "corp-1",
          permanentCode: "permanent-code",
        },
        secret,
        env,
        cacheScope: "connection-1",
      }),
    ).rejects.toThrow("wecom_suite_ticket_missing");
  });
});
