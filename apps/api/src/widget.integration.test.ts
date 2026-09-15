import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWidgetUserHash } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  changelogEntries,
  kbDocuments,
  kbSources,
  organizations,
  widgetSettings,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { widgetHmacSecret } from "./lib/widget.js";
import { createLogger } from "./logger.js";

describe("widget integration", () => {
  it("HMAC session, conversation, and messages", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const db = store.db;
    const [org] = await db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    if (!org) throw new Error("org");

    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    if (!source) throw new Error("source");
    await db.insert(kbDocuments).values({
      orgId: org.id,
      brandId: brand.id,
      sourceId: source.id,
      title: "Reset password",
      rawContent: "Go to settings and click reset password.",
      metadata: { collection: "account", slug: "reset-password", public: true },
      status: "active",
    });
    await db.insert(changelogEntries).values({
      orgId: org.id,
      brandId: brand.id,
      slug: "dark-mode",
      title: "Dark mode is here",
      summary: "Dashboard and widget now support dark theme.",
      plainText: "We shipped dark mode across the product.",
      status: "published",
      publishedAt: new Date("2026-09-15T09:00:00.000Z"),
    });

    const secret = widgetHmacSecret(env);
    const userId = "visitor-test-1";
    const userHash = createWidgetUserHash(secret, userId);

    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "demo",
        brandSlug: "default",
        user: { id: userId, userHash, name: "Visitor" },
      }),
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const configRes = await app.request("/api/v1/widget/config", { headers: auth });
    expect(configRes.status).toBe(200);
    const configBody = (await configRes.json()) as {
      config: {
        brand: { name: string; primaryColor: string };
        modules: Record<string, boolean>;
        menuItems: { label: string; module: string | null }[];
        quickActions: { label: string; type: string; payload: Record<string, unknown> }[];
      };
    };
    expect(configBody.config.brand.name).toBe("Default");
    expect(configBody.config.brand.primaryColor).toBe("#7c5cff");
    expect(configBody.config.modules).toMatchObject({
      home: true,
      messages: true,
      help: true,
      changelog: true,
      tickets: true,
    });
    expect(configBody.config.menuItems.map((item) => item.label)).toEqual([
      "Home",
      "Messages",
      "Help",
      "Changelog",
    ]);
    expect(configBody.config.quickActions.map((action) => action.label)).toEqual([
      "Ask a question",
      "Submit ticket",
      "Bug report",
    ]);

    const [storedSettings] = await db
      .select()
      .from(widgetSettings)
      .where(eq(widgetSettings.brandId, brand.id))
      .limit(1);
    expect(storedSettings?.brandId).toBe(brand.id);

    const homeRes = await app.request("/api/v1/widget/home", { headers: auth });
    expect(homeRes.status).toBe(200);
    const homeBody = (await homeRes.json()) as {
      home: {
        quickActions: { label: string }[];
        articles: { title: string; slug: string }[];
        changelogEntries: { title: string; slug: string }[];
      };
    };
    expect(homeBody.home.quickActions.map((action) => action.label)).toContain("Ask a question");
    expect(homeBody.home.articles).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "reset-password" })]),
    );
    expect(homeBody.home.changelogEntries).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "dark-mode" })]),
    );

    const collectionsRes = await app.request("/api/v1/widget/help/collections", { headers: auth });
    expect(collectionsRes.status).toBe(200);
    const collectionsBody = (await collectionsRes.json()) as { items: { slug: string }[] };
    expect(collectionsBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "account" })]),
    );

    const articlesRes = await app.request("/api/v1/widget/help/articles?q=reset", {
      headers: auth,
    });
    expect(articlesRes.status).toBe(200);
    const articlesBody = (await articlesRes.json()) as { items: { id: string; slug: string }[] };
    expect(articlesBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "reset-password" })]),
    );

    const articleRes = await app.request(
      `/api/v1/widget/help/articles/${articlesBody.items[0]?.id}`,
      { headers: auth },
    );
    expect(articleRes.status).toBe(200);
    const articleBody = (await articleRes.json()) as { article: { body: string } };
    expect(articleBody.article.body).toContain("reset password");

    const changelogRes = await app.request("/api/v1/widget/changelog/entries", { headers: auth });
    expect(changelogRes.status).toBe(200);
    const changelogBody = (await changelogRes.json()) as { items: { slug: string }[] };
    expect(changelogBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "dark-mode" })]),
    );

    const changelogDetailRes = await app.request("/api/v1/widget/changelog/entries/dark-mode", {
      headers: auth,
    });
    expect(changelogDetailRes.status).toBe(200);
    const changelogDetail = (await changelogDetailRes.json()) as {
      entry: { plainText: string };
    };
    expect(changelogDetail.entry.plainText).toContain("dark mode");

    const convRes = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        initialMessage: { plainText: "Hello from widget" },
      }),
    });
    expect(convRes.status).toBe(201);
    const convBody = (await convRes.json()) as { conversation: { id: string }; created: boolean };
    expect(convBody.created).toBe(true);

    const msgRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ plainText: "Follow-up" }),
      },
    );
    expect(msgRes.status).toBe(201);

    const conversationsRes = await app.request("/api/v1/widget/conversations", { headers: auth });
    expect(conversationsRes.status).toBe(200);
    const conversationsBody = (await conversationsRes.json()) as {
      items: {
        id: string;
        status: string;
        lastMessagePreview: string | null;
        unreadCount: number;
      }[];
    };
    expect(conversationsBody.items).toHaveLength(1);
    expect(conversationsBody.items[0]).toMatchObject({
      id: convBody.conversation.id,
      status: "open",
      lastMessagePreview: "Follow-up",
      unreadCount: 0,
    });

    const listRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      { headers: auth },
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { plainText: string }[] };
    expect(list.items.length).toBeGreaterThanOrEqual(2);

    const badHash = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "demo",
        brandSlug: "default",
        user: { id: userId, userHash: "0".repeat(64) },
      }),
    });
    expect(badHash.status).toBe(401);

    await store.close();
  });
});
