import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { runEmailImapPoll } from "./lib/email-imap-poll.js";
import { createLogger } from "./logger.js";

describe("email IMAP poll (P1-01)", () => {
  it("skips when EMAIL_IMAP_ORG_SLUG is unset", async () => {
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const result = await runEmailImapPoll({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("imap_org_not_configured");
    await store.close();
  });

  it("POST /email/jobs/imap-poll requires auth", async () => {
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const store = createLibsqlStore({ url: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const res = await app.request("/api/v1/email/jobs/imap-poll", { method: "POST" });
    expect(res.status).toBe(401);
    await store.close();
  });
});
