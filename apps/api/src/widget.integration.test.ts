import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWidgetUserHash, hashPassword } from "@keenai/auth";
import { createHelpCenterStubConnector, createKeenaiKb } from "@keenai/kb";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  changelogEntries,
  kbDocuments,
  kbSources,
  members,
  organizations,
  widgetSettings,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { insertAttachment } from "./lib/attachments.js";
import { getKbChunkFtsStore } from "./lib/kb-chunk-fts-init.js";
import { widgetHmacSecret } from "./lib/widget.js";
import { createLogger } from "./logger.js";

describe("widget integration", () => {
  it("HMAC session, conversation, and messages", async () => {
    const env = parseApiEnv({ NODE_ENV: "test", LLM_PROVIDER: "stub" });
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
    const [account] = await db
      .insert(accounts)
      .values({
        email: "owner@widget.test",
        name: "Widget Owner",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    if (!account) throw new Error("account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

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
    const kb = createKeenaiKb({ db });
    await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: source.id,
      connector: createHelpCenterStubConnector(),
    });
    const chunkFts = getKbChunkFtsStore();
    for (const document of await kb.listDocuments({ orgId: org.id, brandId: brand.id })) {
      await kb.indexDocument({
        orgId: org.id,
        brandId: brand.id,
        documentId: document.id,
        chunkFtsIndexer: chunkFts,
      });
    }
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
    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@widget.test",
        password: "password12345",
        orgSlug: "demo",
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = (await loginRes.json()) as { accessToken: string };
    const adminAuth = { Authorization: `Bearer ${loginBody.accessToken}` };

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

    const settingsPatchRes = await app.request(`/api/v1/widget/settings/${brand.id}`, {
      method: "PATCH",
      headers: { ...adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryColor: "#123abc",
        agentName: "Demo Agent",
        greetingTitle: "Welcome to Demo",
        modules: { changelog: false },
        menuItems: [
          {
            label: "Home",
            type: "module",
            module: "home",
            location: "bottom_nav",
            sortOrder: 0,
          },
          {
            label: "Docs",
            type: "external",
            href: "https://docs.example.com",
            location: "home_card",
            sortOrder: 1,
          },
        ],
        quickActions: [
          {
            label: "Ask support",
            type: "start_chat",
            payload: { source: "settings" },
            sortOrder: 0,
          },
        ],
        featured: [
          {
            type: "external",
            title: "Release notes",
            href: "https://example.com/releases",
            sortOrder: 0,
          },
        ],
      }),
    });
    expect(settingsPatchRes.status).toBe(200);
    const settingsPatchBody = (await settingsPatchRes.json()) as {
      config: {
        brand: { primaryColor: string };
        agent: { name: string; greetingTitle: string };
        modules: Record<string, boolean>;
        menuItems: { label: string; href?: string | null }[];
        quickActions: { label: string; payload: Record<string, unknown> }[];
      };
    };
    expect(settingsPatchBody.config.brand.primaryColor).toBe("#123abc");
    expect(settingsPatchBody.config.agent.name).toBe("Demo Agent");
    expect(settingsPatchBody.config.agent.greetingTitle).toBe("Welcome to Demo");
    expect(settingsPatchBody.config.modules.changelog).toBe(false);
    expect(settingsPatchBody.config.menuItems.map((item) => item.label)).toEqual(["Home", "Docs"]);
    expect(settingsPatchBody.config.quickActions[0]).toMatchObject({
      label: "Ask support",
      payload: { source: "settings" },
    });

    const settingsGetRes = await app.request(`/api/v1/widget/settings/${brand.id}`, {
      headers: adminAuth,
    });
    expect(settingsGetRes.status).toBe(200);

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
        featured: { title: string | null; href: string | null }[];
        articles: { title: string; slug: string }[];
        changelogEntries: { title: string; slug: string }[];
      };
    };
    expect(homeBody.home.quickActions.map((action) => action.label)).toContain("Ask support");
    expect(homeBody.home.featured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Release notes",
          href: "https://example.com/releases",
        }),
      ]),
    );
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

    const dashboardConversationsRes = await app.request(
      `/api/v1/conversations?brandId=${brand.id}`,
      { headers: adminAuth },
    );
    expect(dashboardConversationsRes.status).toBe(200);
    const dashboardConversationsBody = (await dashboardConversationsRes.json()) as {
      items: { id: string; channelType: string; userId: string | null; messageCount: number }[];
    };
    expect(dashboardConversationsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: convBody.conversation.id,
          channelType: "messenger",
          userId,
          messageCount: expect.any(Number),
        }),
      ]),
    );

    const listRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      { headers: auth },
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { plainText: string }[] };
    expect(list.items.length).toBeGreaterThanOrEqual(2);

    const answerRes = await app.request("/api/v1/widget/answer", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: convBody.conversation.id,
        query: "billing invoice",
        limit: 5,
        rerank: false,
      }),
    });
    expect(answerRes.status).toBe(200);
    expect(answerRes.headers.get("content-type")).toContain("text/event-stream");
    const answerStream = await answerRes.text();
    expect(answerStream).toContain("event: searching");
    expect(answerStream).toContain("event: meta");
    expect(answerStream).toContain("event: text-delta");
    expect(answerStream).toContain("event: done");

    const answerMessagesRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      { headers: auth },
    );
    const answerMessages = (await answerMessagesRes.json()) as {
      items: { plainText: string; senderType: string }[];
    };
    expect(answerMessages.items.some((item) => item.plainText === "billing invoice")).toBe(true);
    expect(answerMessages.items.some((item) => item.senderType === "ai")).toBe(true);

    const handoffRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/handoff`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(handoffRes.status).toBe(200);
    const handoffBody = (await handoffRes.json()) as {
      message: { plainText: string; senderType: string };
      conversation: { id: string };
    };
    expect(handoffBody.conversation.id).toBe(convBody.conversation.id);
    expect(handoffBody.message).toMatchObject({
      plainText: "I need help from the team.",
      senderType: "user",
    });

    const presignRes = await app.request("/api/v1/widget/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "screenshot.png",
        contentType: "image/png",
        sizeBytes: 8,
      }),
    });
    expect(presignRes.status).toBe(201);
    const presignBody = (await presignRes.json()) as { uploadUrl: string };
    expect(presignBody.uploadUrl).toContain("/api/v1/widget/uploads/");

    const pendingAttachment = await insertAttachment(db, {
      orgId: org.id,
      storageKey: `${"a".repeat(32)}.pdf`,
      fileName: "error-report.pdf",
      contentType: "application/pdf",
      sizeBytes: 128,
      metadata: { source: "test" },
    });

    const ticketRes = await app.request("/api/v1/widget/tickets", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bug",
        title: "Bug report",
        description: "The widget submit button is not responding.",
        attachmentIds: [pendingAttachment.id],
      }),
    });
    expect(ticketRes.status).toBe(201);
    const ticketBody = (await ticketRes.json()) as {
      ticket: { title: string; customerId: string | null; conversationIds: string[] };
      conversation: { id: string };
    };
    expect(ticketBody.ticket.title).toBe("Bug report");
    expect(ticketBody.ticket.customerId).toBe(userId);
    expect(ticketBody.ticket.conversationIds).toContain(ticketBody.conversation.id);

    const ticketMessagesRes = await app.request(
      `/api/v1/widget/conversations/${ticketBody.conversation.id}/messages`,
      { headers: auth },
    );
    expect(ticketMessagesRes.status).toBe(200);
    const ticketMessages = (await ticketMessagesRes.json()) as {
      items: { attachments?: { fileName: string | null }[] }[];
    };
    expect(
      ticketMessages.items.some((item) =>
        item.attachments?.some((attachment) => attachment.fileName === "error-report.pdf"),
      ),
    ).toBe(true);

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
