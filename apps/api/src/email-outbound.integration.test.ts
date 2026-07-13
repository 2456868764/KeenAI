import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, conversations, messages, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { toAuthConfig } from "./config.js";
import { insertAttachment } from "./lib/attachments.js";
import { buildEmailSendJob, dispatchEmailOutbound } from "./lib/email-outbound.js";
import { saveUploadFile } from "./lib/uploads.js";

describe("email outbound (P1-02/07)", () => {
  it("builds send job for email conversations", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    if (!org) throw new Error("fixture failed");
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default", locale: "en" })
      .returning();
    if (!brand) throw new Error("fixture failed");

    const [conv] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId: "customer@acme.test",
        channelType: "email",
        channelId: "<thread@mail.test>",
        subject: "Billing question",
        status: "open",
      })
      .returning();
    if (!conv) throw new Error("fixture failed");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const job = await buildEmailSendJob(db, env, {
      orgId: org.id,
      conversationId: conv.id,
      plainText: "Thanks for writing in.",
      agentName: "Support",
    });

    expect(job?.to).toBe("customer@acme.test");
    expect(job?.conversationSubject).toBe("Billing question");
    expect(job?.inReplyTo).toBe("<thread@mail.test>");

    await store.close();
  });

  it("skips dispatch when SMTP is not configured", async () => {
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const authConfig = toAuthConfig(env);
    const store = createLibsqlStore({ url: ":memory:" });

    const result = await dispatchEmailOutbound(store.db, env, authConfig, {
      to: "customer@acme.test",
      subject: "Re: Hi",
      plainText: "Hello",
      agentName: "Agent",
      conversationSubject: "Hi",
    });

    expect(result.mode).toBe("skipped");
    expect(result.reason).toBe("smtp_not_configured");
    await store.close();
  });

  it("includes linked message attachments in email send jobs", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "email-mm", name: "Email MM" })
      .returning();
    if (!org) throw new Error("fixture failed");
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default", locale: "en" })
      .returning();
    if (!brand) throw new Error("fixture failed");

    const [conv] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId: "customer@email-mm.test",
        channelType: "email",
        channelId: "<thread-email-mm@mail.test>",
        subject: "Screenshot request",
        status: "open",
      })
      .returning();
    if (!conv) throw new Error("fixture failed");

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-email-outbound-attachments",
      ),
    });
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
    const storageKey = "11111111111111111111111111111111.pdf";
    await saveUploadFile(env, storageKey, bytes);
    const [message] = await db
      .insert(messages)
      .values({
        orgId: org.id,
        conversationId: conv.id,
        senderType: "agent",
        plainText: "Invoice attached.",
        content: { type: "text", text: "Invoice attached." },
        sentVia: "web",
        deliveryStatus: "sent",
      })
      .returning();
    if (!message) throw new Error("fixture failed");

    await insertAttachment(db, {
      orgId: org.id,
      messageId: message.id,
      storageKey,
      fileName: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });

    const job = await buildEmailSendJob(db, env, {
      orgId: org.id,
      conversationId: conv.id,
      plainText: message.plainText,
      messageId: message.id,
    });

    expect(job?.attachments).toEqual([
      {
        fileName: "invoice.pdf",
        contentType: "application/pdf",
        contentBase64: Buffer.from(bytes).toString("base64"),
      },
    ]);

    await store.close();
  });
});
