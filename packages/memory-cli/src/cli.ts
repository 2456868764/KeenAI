import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportMemoryVault } from "@keenai/memory";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { migrate } from "drizzle-orm/libsql/migrator";

type CliArgs = {
  command?: string;
  subcommand?: string;
  vault: boolean;
  orgId?: string;
  brandId?: string;
  out: string;
  databaseUrl?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { vault: false, out: "./memory-vault" };
  const positional: string[] = [];

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
    positional.push(arg ?? "");
  }

  args.command = positional[0];
  args.subcommand = positional[1];
  return args;
}

function usage(): string {
  return [
    "Usage:",
    "  keenai memory export --vault --org-id <org> --brand-id <brand> [--out ./memory-vault]",
    "",
    "Environment:",
    "  DATABASE_URL  LibSQL database URL (or pass --database-url)",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command !== "memory" || args.subcommand !== "export" || !args.vault) {
    console.error(usage());
    process.exit(1);
  }

  if (!args.orgId || !args.brandId) {
    console.error("--org-id and --brand-id are required");
    process.exit(1);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
