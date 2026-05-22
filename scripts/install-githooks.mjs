import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gitDir = join(root, ".git");
const hooksDir = join(root, ".githooks");
const preCommit = join(hooksDir, "pre-commit");
const commitMsg = join(hooksDir, "commit-msg");

if (!existsSync(gitDir)) {
  process.exit(0);
}

for (const hook of [preCommit, commitMsg]) {
  if (existsSync(hook)) {
    chmodSync(hook, 0o755);
  }
}

try {
  execSync("git config core.hooksPath .githooks", { cwd: root, stdio: "inherit" });
  console.log("Git hooks installed → .githooks (pre-commit: lint · commit-msg: commitlint)");
} catch {
  // Non-fatal in CI or restricted environments
  process.exit(0);
}
