import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { migrate } from "drizzle-orm/libsql/migrator";
import { importIntercomKbArticles } from "./import-intercom-kb.js";
import { importZendeskKbArticles } from "./import-zendesk-kb.js";

export type ImportProvider = "intercom" | "zendesk";

export type ImportCliArgs = {
  provider: ImportProvider;
  file?: string;
  tickets?: string;
  kb?: string;
  articles?: string;
  orgSlug: string;
  dryRun: boolean;
};

export function parseImportArgv(argv: string[]): ImportCliArgs | null {
  const provider = argv[0] as ImportProvider | undefined;
  if (provider !== "intercom" && provider !== "zendesk") return null;

  const args: ImportCliArgs = {
    provider,
    orgSlug: "",
    dryRun: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (flag === "--file") {
      args.file = argv[++i];
      continue;
    }
    if (flag === "--tickets") {
      args.tickets = argv[++i];
      continue;
    }
    if (flag === "--kb") {
      args.kb = argv[++i];
      continue;
    }
    if (flag === "--articles") {
      args.articles = argv[++i];
      continue;
    }
    if (flag === "--org-slug") {
      args.orgSlug = argv[++i] ?? "";
      continue;
    }
    throw new Error(`unknown flag: ${flag}`);
  }

  return args;
}

async function assertReadable(filePath: string, label: string) {
  const resolved = path.resolve(filePath);
  await access(resolved);
  return resolved;
}

/** Sprint 18 GA stub — validates inputs and prints import plan (no writes yet). */
export async function runImportCommand(args: ImportCliArgs): Promise<void> {
  if (!args.orgSlug) {
    throw new Error("--org-slug is required");
  }

  if (args.provider === "intercom") {
    if (args.articles) {
      const articles = await assertReadable(args.articles, "intercom articles");
      const env = parseApiEnv({ DATABASE_URL: process.env.DATABASE_URL ?? ":memory:" });
      const store = createLibsqlStore({ url: env.DATABASE_URL });
      const migrationsFolder = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../storage/migrations/libsql",
      );
      await migrate(store.db, { migrationsFolder });

      const result = await importIntercomKbArticles({
        db: store.db,
        orgSlug: args.orgSlug,
        articlesFilePath: articles,
        dryRun: args.dryRun,
      });

      console.log("[keenai import] Intercom Help Center → KeenAI KB");
      console.log(`  org-slug:  ${args.orgSlug}`);
      console.log(`  articles:  ${articles}`);
      console.log(`  sourceId:  ${result.sourceId}`);
      console.log(`  imported:  ${result.imported}`);
      console.log(`  skipped:   ${result.skipped}`);
      if (args.dryRun) console.log("  mode: dry-run (no database writes)");
      else console.log("  next: re-index via API ingest or kb.indexDocument per document");

      await store.close();
      return;
    }

    if (!args.file) {
      throw new Error("intercom import requires --articles <json> or --file <export.zip>");
    }
    const file = await assertReadable(args.file, "intercom export");
    console.log("[keenai import] Intercom full export (stub)");
    console.log(`  org-slug: ${args.orgSlug}`);
    console.log(`  source:   ${file}`);
    console.log("  maps:");
    console.log("    users/admins → accounts + members");
    console.log("    conversations → conversations + messages");
    console.log("  articles: use --articles <json> for Help Center → kb_documents");
    if (args.dryRun) console.log("  mode: dry-run (no database writes)");
    return;
  }

  if (!args.kb)
    throw new Error("zendesk import requires --kb <hc-articles.json> (tickets import planned)");

  const kb = await assertReadable(args.kb, "zendesk kb");
  const env = parseApiEnv({ DATABASE_URL: process.env.DATABASE_URL ?? ":memory:" });
  const store = createLibsqlStore({ url: env.DATABASE_URL });
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../storage/migrations/libsql",
  );
  await migrate(store.db, { migrationsFolder });

  const result = await importZendeskKbArticles({
    db: store.db,
    orgSlug: args.orgSlug,
    kbFilePath: kb,
    dryRun: args.dryRun,
  });

  console.log("[keenai import] Zendesk Help Center → KeenAI KB");
  console.log(`  org-slug:  ${args.orgSlug}`);
  console.log(`  kb file:   ${kb}`);
  console.log(`  sourceId:  ${result.sourceId}`);
  console.log(`  imported:  ${result.imported}`);
  console.log(`  skipped:   ${result.skipped}`);
  if (args.dryRun) console.log("  mode: dry-run (no database writes)");
  else console.log("  next: re-index via API ingest or kb.indexDocument per document");

  await store.close();
}
