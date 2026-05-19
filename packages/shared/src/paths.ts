import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_FILE = "keenai.db";

/** Walk up until `pnpm-workspace.yaml` (KeenAI monorepo root). */
export function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(startDir);
    }
    dir = parent;
  }
}

export function defaultDatabaseFilePath(fromModuleUrl?: string): string {
  const start = fromModuleUrl ? path.dirname(fileURLToPath(fromModuleUrl)) : process.cwd();
  return path.join(findRepoRoot(start), "data", DB_FILE);
}

export function defaultDatabaseUrl(fromModuleUrl?: string): string {
  return `file:${defaultDatabaseFilePath(fromModuleUrl)}`;
}

/** Use explicit DATABASE_URL when set; otherwise repo-root `data/keenai.db`. */
export function resolveDatabaseUrl(envUrl: string | undefined, fromModuleUrl?: string): string {
  const trimmed = envUrl?.trim();
  const url = trimmed || defaultDatabaseUrl(fromModuleUrl);
  return normalizeFileDatabaseUrl(url, fromModuleUrl);
}

/**
 * Relative `file:` paths (e.g. from root `.env`) resolve against monorepo root,
 * not process.cwd() — so `pnpm seed` from `apps/api` still hits `{repo}/data/keenai.db`.
 */
export function normalizeFileDatabaseUrl(url: string, fromModuleUrl?: string): string {
  if (!url.startsWith("file:") || url.includes(":memory:")) {
    return url;
  }

  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath)) {
    return url;
  }

  const start = fromModuleUrl ? path.dirname(fileURLToPath(fromModuleUrl)) : process.cwd();
  const resolved = path.resolve(findRepoRoot(start), filePath);
  return `file:${resolved}`;
}

export function ensureDatabaseDirectory(databaseUrl: string): void {
  const filePath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
  mkdirSync(path.dirname(filePath), { recursive: true });
}
