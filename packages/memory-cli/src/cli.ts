import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportMemoryVault } from "@keenai/memory";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { migrate } from "drizzle-orm/libsql/migrator";
import { parseImportArgv, runImportCommand } from "./import.js";

type MemoryExportArgs = {
  vault: boolean;
  orgId?: string;
  brandId?: string;
  out: string;
  databaseUrl?: string;
};

function parseMemoryExportArgv(argv: string[]): MemoryExportArgs | null {
  const args: MemoryExportArgs = { vault: false, out: "./memory-vault" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vault") {
      args.vault = true;
      continue;
    }
    if (arg === "--org-id") {
      args.orgId = argv[++i];
      continue;
    }
    if (arg === "--brand-id") {
      args.brandId = argv[++i];
      continue;
    }
    if (arg === "--out") {
      args.out = argv[++i] ?? args.out;
      continue;
    }
    if (arg === "--database-url") {
      args.databaseUrl = argv[++i];
      continue;
    }
    if (arg?.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    }
    return null;
  }

  return args.vault ? args : null;
}

function usage(): string {
  return [
    "KeenAI CLI",
    "",
    "Usage:",
    "  keenai memory export --vault --org-id <org> --brand-id <brand> [--out ./memory-vault]",
    "  keenai import intercom --articles <articles.json> --org-slug <slug> [--dry-run]",
    "  keenai import intercom --file <export.zip> --org-slug <slug> [--dry-run]  # conversations stub",
    "  keenai import zendesk --tickets <tickets.json> [--kb <articles.json>] --org-slug <slug>",
    "",
    "Environment:",
    "  DATABASE_URL  LibSQL URL for memory export (or --database-url)",
  ].join("\n");
}

async function runMemoryExport(args: MemoryExportArgs) {
  if (!args.orgId || !args.brandId) {
    throw new Error("--org-id and --brand-id are required");
  }

  const env = parseApiEnv({
    DATABASE_URL: args.databaseUrl ?? process.env.DATABASE_URL ?? ":memory:",
  });
  const store = createLibsqlStore({ url: env.DATABASE_URL });
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../storage/migrations/libsql",
  );
  await migrate(store.db, { migrationsFolder });

  const result = await exportMemoryVault(store.db, {
    orgId: args.orgId,
    brandId: args.brandId,
    outDir: path.resolve(args.out),
  });

  console.log(`Exported ${result.filesWritten} files to ${result.outDir}`);
  await store.close();
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === "import") {
    const importArgs = parseImportArgv(argv.slice(1));
    if (!importArgs) {
      console.error(usage());
      process.exit(1);
    }
    await runImportCommand(importArgs);
    return;
  }

  if (command === "memory" && argv[1] === "export") {
    const exportArgs = parseMemoryExportArgv(argv.slice(2));
    if (!exportArgs) {
      console.error(usage());
      process.exit(1);
    }
    await runMemoryExport(exportArgs);
    return;
  }

  console.error(usage());
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
