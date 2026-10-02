import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, channelConnections, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";

describe("WeCom self-built webhook", () => {
  it("requires an explicit connection when multiple applications are active", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "wecom-self-built", name: "WeCom Self-built" })
      .returning();
    if (!org) throw new Error("org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");
    const connections = await store.db
      .insert(channelConnections)
      .values([
        {
          orgId: org.id,
          brandId: brand.id,
          channelType: "wecom",
          name: "Application A",
          externalAccountId: "corp-a:agent-a",
          credentials: {
            callbackToken: "token-a",
            encodingAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
            corpId: "corp-a",
          },
        },
        {
          orgId: org.id,
          brandId: brand.id,
          channelType: "wecom",
          name: "Application B",
          externalAccountId: "corp-b:agent-b",
          credentials: {
            callbackToken: "token-b",
            encodingAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
            corpId: "corp-b",
          },
        },
      ])
      .returning();
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const ambiguous = await app.request("/api/v1/webhooks/im/wecom?org=wecom-self-built");
    const selected = await app.request(
      `/api/v1/webhooks/im/wecom?org=wecom-self-built&connection=${connections[0]?.id}`,
    );

    expect(ambiguous.status).toBe(409);
    expect(selected.status).toBe(400);
    expect(await selected.json()).toEqual({ error: "invalid_wecom_verification" });
    await store.close();
  });
});
