import { access } from "node:fs/promises";
import path from "node:path";

export type ImportProvider = "intercom" | "zendesk";

export type ImportCliArgs = {
  provider: ImportProvider;
  file?: string;
  tickets?: string;
  kb?: string;
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
    if (!args.file) throw new Error("intercom import requires --file <export.zip>");
    const file = await assertReadable(args.file, "intercom export");
    console.log("[keenai import] Intercom → KeenAI (stub)");
    console.log(`  org-slug: ${args.orgSlug}`);
    console.log(`  source:   ${file}`);
    console.log("  maps:");
    console.log("    users/admins → accounts + members");
    console.log("    conversations → conversations + messages");
    console.log("    articles → kb_sources (help_center) + kb_documents");
    if (args.dryRun) console.log("  mode: dry-run (no database writes)");
    console.log("\nImport execution is not implemented yet. Track: docs/MIGRATION.md");
    return;
  }

  if (!args.tickets) throw new Error("zendesk import requires --tickets <tickets.json>");
  const tickets = await assertReadable(args.tickets, "zendesk tickets");
  const kb = args.kb ? await assertReadable(args.kb, "zendesk kb") : null;

  console.log("[keenai import] Zendesk → KeenAI (stub)");
  console.log(`  org-slug: ${args.orgSlug}`);
  console.log(`  tickets:  ${tickets}`);
  if (kb) console.log(`  kb:       ${kb}`);
  console.log("  maps:");
  console.log("    users → accounts");
  console.log("    tickets → conversations");
  console.log("    hc articles → kb_sources + kb_documents");
  if (args.dryRun) console.log("  mode: dry-run (no database writes)");
  console.log("\nImport execution is not implemented yet. Track: docs/MIGRATION.md");
}
