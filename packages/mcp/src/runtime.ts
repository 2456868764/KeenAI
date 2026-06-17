import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve Bun executable for stdio MCP servers (CI has bun on PATH; dev may use ~/.bun). */
export function resolveBunCommand(): string {
  const fromEnv = process.env.BUN_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const homeCandidate = join(homedir(), ".bun", "bin", "bun");
  if (existsSync(homeCandidate)) return homeCandidate;

  return "bun";
}
