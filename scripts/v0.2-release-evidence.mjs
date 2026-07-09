import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = process.env.RELEASE_EVIDENCE_DIR ?? "artifacts/release";
const outputPath = join(outputDir, "v0.2.0-evidence.md");

function row(label, value) {
  return `| ${label} | ${value || "n/a"} |`;
}

mkdirSync(outputDir, { recursive: true });

const gitSha = process.env.GITHUB_SHA ?? process.env.GIT_SHA ?? "local";
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "local";

const generatedAt = new Date().toISOString();
const body = [
  "# KeenAI v0.2.0 Release Evidence",
  "",
  `Generated: ${generatedAt}`,
  "",
  "## Build Context",
  "",
  "| Field | Value |",
  "|-------|-------|",
  row("git_sha", gitSha),
  row("run_url", runUrl),
  row("node", process.version),
  row("ci", process.env.CI ?? "false"),
  "",
  "## Gates Covered By CI",
  "",
  "| Gate | Command | Evidence status |",
  "|------|---------|-----------------|",
  "| P0 verify | `pnpm verify:p0` | CI job must pass |",
  "| Lint | `pnpm lint` | CI job must pass |",
  "| Tests / coverage | `pnpm test:coverage` | CI job must pass |",
  "| KB eval | `pnpm kb:eval` | CI job must pass |",
  "| Local KB P95 | `pnpm kb:bench:local` | CI job must pass |",
  "| Typecheck | `pnpm typecheck` | CI job must pass |",
  "| API binary | `pnpm verify:api-binary` | CI job must pass |",
  "| Alpha acceptance | `pnpm alpha:acceptance` | CI job must pass |",
  "",
  "## Gates Requiring External Artifacts",
  "",
  "- API-level `pnpm kb:bench` P95 from a running service.",
  "- Production Recall@5 / stale-answer telemetry from live or production-like golden data.",
  "- GHCR `0.2.0` image publish run.",
  "- Helm install artifact against a reachable Kubernetes cluster.",
  "- Rendered and uploaded YouTube / Bilibili tutorial video links.",
  "",
].join("\n");

writeFileSync(outputPath, body);
console.log(`wrote ${outputPath}`);
