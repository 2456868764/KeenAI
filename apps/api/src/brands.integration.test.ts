import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
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

async function loginToken(app: ReturnType<typeof createApp>) {
  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@brands.test",
      password: "password12345",
      orgSlug: "brands-org",
    }),
  });
  const tokens = (await login.json()) as { accessToken: string };
  return tokens.accessToken;
}

describe("brands integration", () => {
  it("returns personality defaults and persists brand voice settings", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "brands-org", name: "Brands Org" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Acme Support" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "owner@brands.test",
        name: "Owner",
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

    const listRes = await app.request("/api/v1/brands", { headers: auth });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      items: { id: string; personality: { name: string; systemPrompt: string } }[];
    };
    expect(listBody.items[0]?.personality.name).toBe("Acme Support");

    const patchRes = await app.request(`/api/v1/brands/${brand.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        personality: {
          name: "Acme Bot",
          systemPrompt: "You are Acme Bot. Always mention our warranty policy.",
          voice: { tone: "formal", responseLength: "concise" },
        },
        logoUrl: "https://cdn.example.com/logo.png",
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as {
      brand: {
        logoUrl: string | null;
        personality: { name: string; systemPrompt: string; voice: { tone: string } };
      };
    };
    expect(patchBody.brand.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(patchBody.brand.personality.name).toBe("Acme Bot");
    expect(patchBody.brand.personality.systemPrompt).toContain("warranty policy");
    expect(patchBody.brand.personality.voice.tone).toBe("formal");

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "w-brand",
        subject: "Warranty",
        initialMessage: { plainText: "Is my item covered?" },
      }),
    });
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const draftRes = await app.request("/api/v1/copilot/draft", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    expect(draftRes.status).toBe(200);
    const draftBody = await draftRes.text();
    expect(draftBody).toContain("Acme Bo");
    expect(draftBody).toContain("rranty polic");
  });
});
