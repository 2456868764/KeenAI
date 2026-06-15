import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resetSharedMcpHost } from "./lib/mcp-tools.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

const stubServerPath = fileURLToPath(
  new URL("../../../packages/mcp/src/stub-server.ts", import.meta.url),
);

describe("MCP host integration", () => {
  afterAll(async () => {
    await resetSharedMcpHost();
  });

  it("lists stub MCP tools when host is enabled", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "mcp-org", name: "MCP Org" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "mcp@acme.test",
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

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      MCP_HOST_ENABLED: "true",
      MCP_SERVERS: JSON.stringify([{ id: "stub", command: "bun", args: [stubServerPath] }]),
    });
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
        email: "mcp@acme.test",
        password: "password12345",
        orgSlug: "mcp-org",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const serversRes = await app.request("/api/v1/mcp/servers", { headers: auth });
    expect(serversRes.status).toBe(200);
    const serversBody = (await serversRes.json()) as {
      enabled: boolean;
      connected: string[];
    };
    expect(serversBody.enabled).toBe(true);
    expect(serversBody.connected).toContain("stub");

    const toolsRes = await app.request("/api/v1/mcp/tools", { headers: auth });
    expect(toolsRes.status).toBe(200);
    const toolsBody = (await toolsRes.json()) as {
      items: Array<{ name: string; qualifiedName: string }>;
    };
    expect(toolsBody.items.some((tool) => tool.name === "echo")).toBe(true);
    expect(toolsBody.items.some((tool) => tool.qualifiedName === "mcp_stub__echo")).toBe(true);

    const exposeRes = await app.request("/api/v1/mcp/expose/tools", { headers: auth });
    expect(exposeRes.status).toBe(200);
    const exposeBody = (await exposeRes.json()) as {
      transport: string;
      command: string;
      items: Array<{ name: string }>;
    };
    expect(exposeBody.transport).toBe("stdio");
    expect(exposeBody.command).toContain("packages/mcp/src/server.ts");
    expect(exposeBody.items.some((tool) => tool.name === "keenai_search_help")).toBe(true);

    await store.close();
    await resetSharedMcpHost();
  });
});
