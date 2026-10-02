import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  conversations,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { sealChannelCredentials } from "./lib/channel-secrets.js";
import { planConversationImOutbound } from "./lib/im-outbound.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

describe("WeChat Official Account channel", () => {
  it("verifies the callback and ingests a signed XML message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "wechat", name: "WeChat" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const secret = "test-secret-at-least-32-characters-long!!";
    await store.db.insert(channelConnections).values({
      orgId: org.id,
      brandId: brand.id,
      channelType: "wechat",
      name: "WeChat Official Account",
      externalAccountId: "wx-app-1",
      status: "active",
      transport: "webhook",
      credentials: sealChannelCredentials(
        {
          appId: "wx-app-1",
          appSecret: "app-secret",
          callbackToken: "callback-token",
        },
        secret,
      ),
    });
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/test-wechat"),
    });
    const app = createApp({
      store,
      fts: null,
      authConfig: {
        jwtSecret: secret,
        accessTtlSec: 900,
        refreshTtlSec: 604_800,
        appUrl: "http://localhost:3000",
      },
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "nonce-1";
    const signature = sign(["callback-token", timestamp, nonce]);

    const verification = await app.request(
      `/api/v1/webhooks/im/wechat?org=wechat&timestamp=${timestamp}&nonce=${nonce}&signature=${signature}&echostr=verified`,
    );
    expect(verification.status).toBe(200);
    expect(await verification.text()).toBe("verified");

    const xml = `<xml><ToUserName><![CDATA[gh_account]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName><CreateTime>${timestamp}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[Need help with billing]]></Content><MsgId>message-1</MsgId></xml>`;
    const response = await app.request(
      `/api/v1/webhooks/im/wechat?org=wechat&timestamp=${timestamp}&nonce=${nonce}&signature=${signature}`,
      { method: "POST", headers: { "content-type": "application/xml" }, body: xml },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");

    const [conversation] = await store.db
      .select()
      .from(conversations)
      .where(eq(conversations.channelType, "wechat"));
    expect(conversation).toMatchObject({ channelId: "openid-1", userId: "openid-1" });
    const [message] = await store.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, requireRow(conversation, "conversation").id));
    expect(message).toMatchObject({ plainText: "Need help with billing", senderType: "user" });

    const plan = await planConversationImOutbound(store.db, {
      orgId: org.id,
      conversationId: requireRow(conversation, "conversation").id,
      messageId: requireRow(message, "message").id,
      apiBaseUrl: "http://localhost:8090",
    });
    expect(plan).toMatchObject({
      platform: "wechat",
      targetId: "openid-1",
      actions: [{ platform: "wechat", method: "message.send", toUser: "openid-1" }],
    });

    await store.close();
  });
});

function sign(values: string[]): string {
  return createHash("sha1").update(values.sort().join("")).digest("hex");
}
