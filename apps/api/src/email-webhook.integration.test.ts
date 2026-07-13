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

const attachmentFixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/channels-email/tests/fixtures/with-attachment.eml",
  ),
);

const pdfAttachmentFixture = `From: customer@example.com
To: support@keenai.local
Subject: Manual PDF
Message-ID: <pdf1@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="keenai-pdf-boundary"

--keenai-pdf-boundary
Content-Type: text/plain; charset=utf-8

Please see the manual.

--keenai-pdf-boundary
Content-Type: application/pdf; name="manual.pdf"
Content-Disposition: attachment; filename="manual.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJUVPRgo=
--keenai-pdf-boundary--
`;

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

  it("ingests MIME attachments into conversation messages", async () => {
    const uploadDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../data/test-email-attachments",
    );
    const env = parseApiEnv({ NODE_ENV: "test", UPLOAD_DIR: uploadDir });
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

    const res = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: attachmentFixture,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      conversation: { id: string };
      message: { messageKind: string; attachments: { fileName: string | null }[] };
    };
    expect(body.message.messageKind).toBe("photo");
    expect(body.message.attachments).toHaveLength(1);
    expect(body.message.attachments[0]?.fileName).toBe("error.png");

    await store.close();
  });

  it("keeps PDF attachment placeholders in inbound email plainText", async () => {
    const uploadDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../data/test-email-pdf-attachments",
    );
    const env = parseApiEnv({ NODE_ENV: "test", UPLOAD_DIR: uploadDir });
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

    const res = await app.request("/api/v1/webhooks/email/inbound?org=demo", {
      method: "POST",
      body: pdfAttachmentFixture,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      message: {
        plainText: string;
        messageKind: string;
        attachments: { fileName: string | null; contentType: string | null }[];
      };
    };
    expect(body.message.messageKind).toBe("document");
    expect(body.message.plainText).toContain("Please see the manual.");
    expect(body.message.plainText).toContain("[File: manual.pdf]");
    expect(body.message.attachments).toHaveLength(1);
    expect(body.message.attachments[0]?.fileName).toBe("manual.pdf");
    expect(body.message.attachments[0]?.contentType).toBe("application/pdf");

    await store.close();
  });
});
