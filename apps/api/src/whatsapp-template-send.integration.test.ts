import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  channelConnections,
  channelConversationLinks,
  conversations,
  members,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { sealChannelCredentials } from "./lib/channel-secrets.js";
import { createLogger } from "./logger.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("WhatsApp template delivery", () => {
  it("sends an approved template through the standard message and outbox path", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-whatsapp-template-"));
    tempDirectories.push(directory);
    const databaseUrl = `file:${path.join(directory, "template.db")}`;
    const store = createLibsqlStore({ url: databaseUrl });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "whatsapp-template", name: "WhatsApp Template" })
      .returning();
    if (!org) throw new Error("missing_org");
    const [brand] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const [account] = await store.db
      .insert(accounts)
      .values({
        email: "agent@whatsapp.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    if (!brand || !account) throw new Error("missing_fixture");
    await store.db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });
    const [connection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "whatsapp",
        name: "WhatsApp",
        externalAccountId: "phone-number-1",
        status: "active",
        credentials: sealChannelCredentials(
          {
            accessToken: "meta-token",
            phoneNumberId: "phone-number-1",
            wabaId: "waba-1",
            graphApiVersion: "v20.0",
          },
          authConfig.jwtSecret,
        ),
      })
      .returning();
    const [conversation] = await store.db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "whatsapp",
        channelId: "15551234567",
      })
      .returning();
    if (!connection || !conversation) throw new Error("missing_channel_fixture");
    await store.db.insert(channelConversationLinks).values({
      orgId: org.id,
      brandId: brand.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      externalThreadId: "15551234567",
    });

    let providerBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes("/message_templates")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "template-1",
                name: "support_follow_up",
                language: "en_US",
                status: "APPROVED",
                category: "UTILITY",
                components: [{ type: "BODY", text: "Hello {{1}}" }],
              },
              {
                id: "template-2",
                name: "pending_template",
                language: "en_US",
                status: "PENDING",
                category: "UTILITY",
                components: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      providerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.template-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "agent@whatsapp.test",
        password: "password12345",
        orgSlug: "whatsapp-template",
      }),
    });
    const token = ((await login.json()) as { accessToken: string }).accessToken;

    const templatesResponse = await app.request(
      `/api/v1/dashboard/conversations/${conversation.id}/channel-templates`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(templatesResponse.status).toBe(200);
    expect(await templatesResponse.json()).toMatchObject({
      connectionId: connection.id,
      items: [{ id: "template-1", name: "support_follow_up", status: "APPROVED" }],
    });

    const conflicting = await app.request(
      `/api/v1/dashboard/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          plainText: "This text would not be sent",
          directives: {
            whatsappTemplate: {
              name: "support_follow_up",
              languageCode: "en_US",
            },
          },
        }),
      },
    );
    expect(conflicting.status).toBe(400);

    const response = await app.request(
      `/api/v1/dashboard/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          directives: {
            whatsappTemplate: {
              name: "support_follow_up",
              languageCode: "en_US",
              components: [{ type: "body", parameters: [{ type: "text", text: "Alex" }] }],
            },
          },
        }),
      },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { message: { id: string; plainText: string } };
    expect(body.message.plainText).toBe("[WhatsApp template: support_follow_up]");

    await eventually(async () => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(providerBody).toMatchObject({
        messaging_product: "whatsapp",
        to: "15551234567",
        type: "template",
        template: {
          name: "support_follow_up",
          language: { code: "en_US" },
          components: [{ type: "body", parameters: [{ type: "text", text: "Alex" }] }],
        },
      });
      const [stored] = await store.db
        .select()
        .from(messages)
        .where(eq(messages.id, body.message.id));
      expect(stored?.deliveryStatus).toBe("sent");
    });

    const [stored] = await store.db.select().from(messages).where(eq(messages.id, body.message.id));
    expect(stored?.content).toMatchObject({
      outboundDirectives: {
        whatsappTemplate: { name: "support_follow_up", languageCode: "en_US" },
      },
    });
    await store.close();
  });
});

async function eventually(assertion: () => void | Promise<void>, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (candidate) {
      error = candidate;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw error;
}
