import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  channelProviderAppStates,
  organizations,
} from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { putChannelProviderAppState } from "./channel-provider-app-state.js";
import { resetProviderTokenCacheForTests } from "./channel-provider-tokens.js";
import {
  hydrateDingTalkIsvCredentials,
  listDingTalkIsvRuntimeOwners,
  resolveDingTalkIsvConnection,
} from "./dingtalk-isv.js";

const secret = "test-secret-at-least-32-characters-long!!";
const directories: string[] = [];
const stores: Array<ReturnType<typeof createLibsqlStore>> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  resetProviderTokenCacheForTests();
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("DingTalk ISV credential hydration", () => {
  it("hydrates short-lived credentials only in memory from an encrypted suite ticket", async () => {
    const { store, databaseUrl } = await createStore("keenai-dingtalk-isv-");
    await putChannelProviderAppState({
      store,
      provider: "dingtalk",
      appId: "suite-key",
      stateType: "suite_ticket",
      payload: { suiteTicket: "secret-ticket" },
      secret,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ accessToken: "corp-token", expireIn: 7200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = parseApiEnv({
      DATABASE_URL: databaseUrl,
      DINGTALK_ISV_SUITE_KEY: "suite-key",
      DINGTALK_ISV_SUITE_SECRET: "suite-secret",
    });

    await expect(
      hydrateDingTalkIsvCredentials({
        store,
        credentials: { appType: "isv", suiteKey: "suite-key", corpId: "corp-1" },
        secret,
        env,
        cacheScope: "connection-1",
      }),
    ).resolves.toEqual({
      appType: "isv",
      suiteKey: "suite-key",
      corpId: "corp-1",
      appKey: "suite-key",
      appSecret: "suite-secret",
      accessToken: "corp-token",
    });

    const [state] = await store.db.select().from(channelProviderAppStates);
    const persisted = JSON.stringify(state?.encryptedPayload);
    expect(persisted).not.toContain("secret-ticket");
    expect(persisted).not.toContain("suite-secret");
    expect(persisted).not.toContain("corp-token");
  });

  it("rejects an expired suite ticket", async () => {
    const { store, databaseUrl } = await createStore("keenai-dingtalk-isv-expired-");
    await putChannelProviderAppState({
      store,
      provider: "dingtalk",
      appId: "suite-key",
      stateType: "suite_ticket",
      payload: { suiteTicket: "expired-ticket" },
      secret,
      expiresAt: new Date(Date.now() - 1),
    });
    const env = parseApiEnv({
      DATABASE_URL: databaseUrl,
      DINGTALK_ISV_SUITE_KEY: "suite-key",
      DINGTALK_ISV_SUITE_SECRET: "suite-secret",
    });

    await expect(
      hydrateDingTalkIsvCredentials({
        store,
        credentials: { appType: "isv", suiteKey: "suite-key", corpId: "corp-1" },
        secret,
        env,
        cacheScope: "connection-1",
      }),
    ).rejects.toThrow("dingtalk_suite_ticket_missing");
  });

  it("selects one suite runtime and resolves each message to exactly one corp connection", async () => {
    const { store } = await createStore("keenai-dingtalk-routing-");
    const [orgA, orgB] = await store.db
      .insert(organizations)
      .values([
        { id: "org-a", slug: "org-a", name: "Org A" },
        { id: "org-b", slug: "org-b", name: "Org B" },
      ])
      .returning();
    if (!orgA || !orgB) throw new Error("organizations_missing");
    await store.db.insert(brands).values([
      { id: "brand-a", orgId: orgA.id, slug: "default", name: "Brand A" },
      { id: "brand-b", orgId: orgB.id, slug: "default", name: "Brand B" },
    ]);
    await store.db.insert(channelConnections).values([
      {
        id: "connection-z",
        orgId: orgA.id,
        brandId: "brand-a",
        channelType: "dingtalk",
        name: "Corp A",
        externalAccountId: "corp-a",
        transport: "stream",
        settings: { appType: "isv", suiteKey: "suite-key" },
      },
      {
        id: "connection-a",
        orgId: orgB.id,
        brandId: "brand-b",
        channelType: "dingtalk",
        name: "Corp B",
        externalAccountId: "corp-b",
        transport: "stream",
        settings: { appType: "isv", suiteKey: "suite-key" },
      },
    ]);

    await expect(listDingTalkIsvRuntimeOwners(store)).resolves.toMatchObject([
      { id: "connection-a" },
    ]);
    await expect(
      resolveDingTalkIsvConnection({ store, suiteKey: "suite-key", corpId: "corp-a" }),
    ).resolves.toMatchObject({ id: "connection-z", orgId: "org-a", brandId: "brand-a" });
    await expect(
      resolveDingTalkIsvConnection({ store, suiteKey: "suite-key", corpId: "missing" }),
    ).rejects.toThrow("channel_not_configured");

    await store.db.insert(channelConnections).values({
      id: "connection-duplicate",
      orgId: orgA.id,
      brandId: "brand-a",
      channelType: "dingtalk",
      name: "Duplicate Corp B",
      externalAccountId: "corp-b",
      transport: "stream",
      settings: { appType: "isv", suiteKey: "suite-key" },
    });
    await expect(
      resolveDingTalkIsvConnection({ store, suiteKey: "suite-key", corpId: "corp-b" }),
    ).rejects.toThrow("ambiguous_channel_connection");
  });
});

async function createStore(prefix: string) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  directories.push(directory);
  const databaseUrl = `file:${path.join(directory, "isv.db")}`;
  const store = createLibsqlStore({ url: databaseUrl });
  stores.push(store);
  await migrate(store.db, {
    migrationsFolder: path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    ),
  });
  return { store, databaseUrl };
}
