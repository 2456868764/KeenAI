import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gitDir = join(root, ".git");
const hooksDir = join(root, ".githooks");
const preCommit = join(hooksDir, "pre-commit");

if (!existsSync(gitDir)) {
  process.exit(0);
}

if (existsSync(preCommit)) {
  chmodSync(preCommit, 0o755);
}

try {
  execSync("git config core.hooksPath .githooks", { cwd: root, stdio: "inherit" });
  console.log("Git hooks installed → .githooks (pre-commit runs pnpm lint)");
} catch {
  // Non-fatal in CI or restricted environments
  process.exit(0);
}
