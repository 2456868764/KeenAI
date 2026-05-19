import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/channels-email/tests/fixtures/simple-reply.eml",
  ),
);

describe("email webhook integration", () => {
  it("ingests raw MIME and threads by In-Reply-To", async () => {
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
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    if (!org) throw new Error("org");

    await store.db.insert(brands).values({ orgId: org.id, slug: "default", name: "Default" });

    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const first = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: `From: customer@example.com
To: support@keenai.local
Subject: Help with billing
Message-ID: <msg1@example.com>
Content-Type: text/plain

First email
`,
    });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { created: boolean; conversation: { id: string } };
    expect(firstBody.created).toBe(true);

    const second = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: fixture,
    });
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as {
      created: boolean;
      conversation: { id: string };
      thread: { matchReason: string };
    };
    expect(secondBody.created).toBe(false);
    expect(secondBody.conversation.id).toBe(firstBody.conversation.id);
    expect(secondBody.thread.matchReason).toBe("in-reply-to");

    await store.close();
  });
});
