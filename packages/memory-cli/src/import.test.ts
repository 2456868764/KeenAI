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
