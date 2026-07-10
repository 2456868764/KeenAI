import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const docsChecks = [
  {
    id: "docs_app_package",
    label: "Docs app package exists",
    path: "apps/docs/package.json",
    contains: ["@keenai/docs"],
  },
  {
    id: "docs_home",
    label: "Docs hub links roadmap, deployment, migration, and GA",
    path: "apps/docs/src/app/page.tsx",
    contains: ["Roadmap", "Deployment", "Migration", "GA checklist"],
  },
  {
    id: "quickstart_page",
    label: "Quickstart page covers install, migrate, dev, smoke, and Docker lite",
    path: "apps/docs/src/app/quickstart/page.tsx",
    contains: ["Clone & install", "Migrate & seed", "Start dev", "Smoke test", "Docker lite"],
  },
  {
    id: "tutorial_index",
    label: "v0.2.0 tutorial kit index exists",
    path: "docs/tutorials/v0.2.0/README.md",
    contains: ["Self-hosted quickstart", "KB import, eval, and bench", "Required proof"],
  },
  {
    id: "self_hosted_video_script",
    label: "Self-hosted quickstart video script is recording-ready",
    path: "docs/tutorials/v0.2.0/self-hosted-quickstart.md",
    contains: ["YouTube title:", "Bilibili title:", "## Shot list", "## Voiceover", "## Captions"],
  },
  {
    id: "kb_eval_video_script",
    label: "KB import/eval/bench video script is recording-ready",
    path: "docs/tutorials/v0.2.0/kb-import-eval-bench.md",
    contains: ["YouTube title:", "Bilibili title:", "## Shot list", "## Voiceover", "## Captions"],
  },
  {
    id: "publishing_checklist",
    label: "Tutorial publishing checklist exists",
    path: "docs/tutorials/v0.2.0/publishing-checklist.md",
    contains: [
      "Upload both MP4s to YouTube",
      "Upload both MP4s to Bilibili",
      "Only mark P3-12 done",
    ],
  },
];

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function evaluateCheck(check) {
  const absolutePath = join(ROOT, check.path);
  if (!existsSync(absolutePath)) {
    return { ...check, passed: false, missing: ["file missing"] };
  }

  const body = readFileSync(absolutePath, "utf8");
  const missing = check.contains.filter((needle) => !body.includes(needle));
  return { ...check, passed: missing.length === 0, missing };
}

function renderMarkdown(report) {
  const rows = report.checks
    .map(
      (check) =>
        `| ${check.id} | ${check.passed ? "pass" : "fail"} | ${
          check.missing.length > 0 ? check.missing.join("; ") : "none"
        } |`,
    )
    .join("\n");

  return [
    "# Docs Release Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| checks | ${report.passedChecks}/${report.totalChecks} |`,
    `| external_required | ${report.externalRequired.length > 0 ? report.externalRequired.join("; ") : "none"} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Checks",
    "",
    "| ID | Status | Missing |",
    "|----|--------|---------|",
    rows,
    "",
  ].join("\n");
}

const evaluated = docsChecks.map(evaluateCheck);
const failures = evaluated.filter((check) => !check.passed).map((check) => check.id);
const externalRequired = [
  "Rendered MP4 files or YouTube/Bilibili upload URLs are still required before closing P3-12.",
  "The public quickstart video link must be added to docs/releases/v0.2.0.md before closing P1-11.",
];

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length > 0 ? "fail" : "partial",
  sourceDocs: ["apps/docs", "docs/tutorials/v0.2.0"],
  totalChecks: evaluated.length,
  passedChecks: evaluated.filter((check) => check.passed).length,
  checks: evaluated,
  failures,
  externalRequired,
};

const jsonPath = outputPath("DOCS_RELEASE_REPORT_JSON_OUT", "docs-release.json");
const markdownPath = outputPath("DOCS_RELEASE_REPORT_MD", "docs-release.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
