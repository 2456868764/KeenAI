import { describe, expect, it } from "vitest";
import { parseImportArgv } from "./import.js";

describe("keenai import CLI", () => {
  it("parses intercom import args", () => {
    const args = parseImportArgv([
      "intercom",
      "--file",
      "./export.zip",
      "--org-slug",
      "acme",
      "--dry-run",
    ]);
    expect(args?.provider).toBe("intercom");
    expect(args?.file).toBe("./export.zip");
    expect(args?.orgSlug).toBe("acme");
    expect(args?.dryRun).toBe(true);
  });

  it("parses intercom --articles import args", () => {
    const args = parseImportArgv([
      "intercom",
      "--articles",
      "./articles.json",
      "--org-slug",
      "acme",
    ]);
    expect(args?.provider).toBe("intercom");
    expect(args?.articles).toBe("./articles.json");
  });

  it("parses zendesk import args", () => {
    const args = parseImportArgv(["zendesk", "--kb", "./articles.json", "--org-slug", "acme"]);
    expect(args?.provider).toBe("zendesk");
    expect(args?.kb).toBe("./articles.json");
  });
});

describe("importZendeskKbArticles", () => {
  it("imports help center articles into kb_documents", async () => {
    const { importZendeskKbArticles } = await import("./import-zendesk-kb.js");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createLibsqlStore } = await import("@keenai/storage");
    const { brands, organizations } = await import("@keenai/storage/schema");
    const { migrate } = await import("drizzle-orm/libsql/migrator");

    const dir = await mkdtemp(path.join(tmpdir(), "keenai-import-"));
    const kbFile = path.join(dir, "articles.json");
    await writeFile(
      kbFile,
      JSON.stringify([
        { id: "1", title: "Reset password", body: "Use forgot password link." },
        { id: "2", title: "", body: "skip me" },
      ]),
    );

    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    await store.db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();

    const result = await importZendeskKbArticles({
      db: store.db,
      orgSlug: "acme",
      kbFilePath: kbFile,
      dryRun: false,
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    await store.close();
  });
});

describe("importIntercomKbArticles", () => {
  it("imports help center articles into kb_documents", async () => {
    const { importIntercomKbArticles } = await import("./import-intercom-kb.js");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createLibsqlStore } = await import("@keenai/storage");
    const { brands, organizations } = await import("@keenai/storage/schema");
    const { migrate } = await import("drizzle-orm/libsql/migrator");

    const dir = await mkdtemp(path.join(tmpdir(), "keenai-intercom-"));
    const articlesFile = path.join(dir, "articles.json");
    await writeFile(
      articlesFile,
      JSON.stringify({
        type: "article.list",
        data: [
          { id: "10", title: "Billing FAQ", description: "<p>Contact support.</p>" },
          { id: "11", title: "", body: "skip" },
        ],
      }),
    );

    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    await store.db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();

    const result = await importIntercomKbArticles({
      db: store.db,
      orgSlug: "acme",
      articlesFilePath: articlesFile,
      dryRun: false,
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    await store.close();
  });
});

describe("importIntercomFullExport", () => {
  it("imports users, conversations, and messages into core tables", async () => {
    const { importIntercomFullExport } = await import("./import-intercom-full.js");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createLibsqlStore } = await import("@keenai/storage");
    const { accounts, brands, conversations, messages, organizations } = await import(
      "@keenai/storage/schema"
    );
    const { eq } = await import("drizzle-orm");
    const { migrate } = await import("drizzle-orm/libsql/migrator");

    const dir = await mkdtemp(path.join(tmpdir(), "keenai-intercom-full-"));
    const file = path.join(dir, "intercom-export.json");
    await writeFile(
      file,
      JSON.stringify({
        users: [{ id: "user-1", email: "jane@example.com", name: "Jane Customer" }],
        admins: [{ id: "admin-1", email: "agent@example.com", name: "Agent One", type: "admin" }],
        conversations: [
          {
            id: "conv-1",
            state: "open",
            user: { id: "user-1", type: "user" },
            conversation_message: {
              id: "msg-1",
              body: "<p>I need help with billing.</p>",
              author: { id: "user-1", type: "user" },
              created_at: 1_700_000_000,
            },
            conversation_parts: {
              conversation_parts: [
                {
                  id: "part-1",
                  part_type: "comment",
                  body: "<p>We can help.</p>",
                  author: { id: "admin-1", type: "admin" },
                  created_at: 1_700_000_060,
                },
              ],
            },
          },
        ],
      }),
    );

    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    await store.db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();

    const result = await importIntercomFullExport({
      db: store.db,
      orgSlug: "acme",
      filePath: file,
      dryRun: false,
    });

    expect(result.usersImported).toBe(2);
    expect(result.conversationsImported).toBe(1);
    expect(result.messagesImported).toBe(2);
    expect(await store.db.select().from(accounts)).toHaveLength(2);
    const [conversation] = await store.db
      .select()
      .from(conversations)
      .where(eq(conversations.channelId, "conv-1"))
      .limit(1);
    expect(conversation?.channelType).toBe("intercom");
    const rows = await store.db.select().from(messages);
    expect(rows.map((row) => row.plainText)).toEqual(["I need help with billing.", "We can help."]);
    await store.close();
  });
});
