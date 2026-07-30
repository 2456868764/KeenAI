import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const THRESHOLD = Number(process.env.FEATUREBASE_PARITY_THRESHOLD ?? 0.9);

const criteria = [
  {
    id: "inbox-four-column",
    label: "Inbox four-column support workspace",
    weight: 10,
    paths: [
      "apps/dashboard/src/app/inbox/page.tsx",
      "apps/dashboard/src/components/inbox/inbox-shell.tsx",
      "apps/dashboard/src/components/inbox/conversation-list.tsx",
      "apps/dashboard/src/components/inbox/message-thread.tsx",
      "apps/dashboard/src/components/inbox/rich-text-composer.tsx",
      "apps/dashboard/src/components/layout/app-shell.tsx",
    ],
    contains: [
      ["apps/dashboard/src/components/layout/app-shell.tsx", "AI Agent"],
      ["apps/dashboard/src/components/layout/app-shell.tsx", "My inbox"],
      ["apps/dashboard/src/components/inbox/inbox-shell.tsx", "ConversationList"],
      ["apps/dashboard/src/components/inbox/inbox-shell.tsx", "MessageThread"],
      ["apps/dashboard/src/components/inbox/inbox-shell.tsx", "viewToStatusFilter"],
    ],
  },
  {
    id: "workflow-builder",
    label: "Workflow builder canvas",
    weight: 9,
    paths: [
      "apps/dashboard/src/app/workflows/page.tsx",
      "apps/dashboard/src/app/workflows/[id]/page.tsx",
      "apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx",
      "apps/api/src/routes/workflows.ts",
      "packages/workflow/src/index.ts",
      "docs/13-WORKFLOW.md",
    ],
    contains: [
      ["apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx", "WorkflowTriggerNode"],
      [
        "apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx",
        "Let Keeni instructions",
      ],
      ["apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx", "Let Keeni max steps"],
      ["apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx", "Let Keeni tool filter"],
      ["apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx", "ReplyButtonOutputs"],
      [
        "apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx",
        "Reply buttons allow free-text fallback",
      ],
      [
        "apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx",
        "Reply buttons auto close timer",
      ],
      ["apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx", "RouteOutputs"],
      [
        "apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx",
        "nodesDraggable={false}",
      ],
      ["apps/dashboard/src/components/workflows/workflow-flow-canvas.tsx", "Webhook headers"],
      ["apps/dashboard/src/components/workflows/workflow-formats.ts", "parseWebhookHeaders"],
      ["apps/dashboard/src/components/workflows/workflow-editor.tsx", "Remove conversation tag"],
      ["apps/dashboard/src/components/workflows/workflow-list.tsx", "reorderWorkflows"],
      ["apps/dashboard/src/components/workflows/workflow-list.tsx", "workflowGroupNotice"],
      ["apps/dashboard/src/components/workflows/workflow-list-meta.ts", "Manage agent deployment"],
      ["apps/api/src/routes/workflows.ts", "/reorder"],
      ["docs/13-WORKFLOW.md", "Canvas 框架决策"],
      ["docs/13-WORKFLOW.md", "不迁移到新的 canvas 框架"],
    ],
  },
  {
    id: "feedback-portal",
    label: "Feedback board and public portal",
    weight: 9,
    paths: [
      "apps/portal/src/app/feedback/page.tsx",
      "apps/dashboard/src/app/feedback/page.tsx",
      "apps/dashboard/src/components/feedback/feedback-shell.tsx",
      "apps/api/src/routes/feedback.ts",
    ],
    contains: [
      ["apps/dashboard/src/components/feedback/feedback-shell.tsx", "findFeedbackDuplicates"],
    ],
  },
  {
    id: "roadmap-changelog",
    label: "Roadmap and changelog surfaces",
    weight: 8,
    paths: [
      "apps/portal/src/app/roadmap/page.tsx",
      "apps/portal/src/app/changelog/page.tsx",
      "apps/dashboard/src/app/roadmap/page.tsx",
      "apps/dashboard/src/app/changelog/page.tsx",
      "apps/api/src/routes/roadmap.ts",
      "apps/api/src/routes/changelog.ts",
    ],
  },
  {
    id: "help-center-ai-search",
    label: "Help Center with AI search",
    weight: 9,
    paths: [
      "apps/portal/src/app/help/page.tsx",
      "apps/portal/src/app/help/help-search.tsx",
      "apps/dashboard/src/app/help-center/page.tsx",
      "apps/dashboard/src/components/help-center/help-center-shell.tsx",
      "apps/api/src/routes/help-center.ts",
      "apps/api/src/routes/kb.ts",
    ],
    contains: [["apps/portal/src/app/help/help-search.tsx", "AI answer"]],
  },
  {
    id: "directory-users",
    label: "Directory users table",
    weight: 8,
    paths: [
      "apps/dashboard/src/app/directory/page.tsx",
      "apps/dashboard/src/components/directory/directory-shell.tsx",
      "apps/api/src/routes/members.ts",
    ],
    contains: [
      ["apps/dashboard/src/components/directory/directory-shell.tsx", "All users"],
      ["apps/dashboard/src/components/directory/directory-shell.tsx", "Person tag"],
    ],
  },
  {
    id: "widget-messenger",
    label: "Messenger widget",
    weight: 9,
    paths: [
      "apps/widget/src/boot.ts",
      "apps/widget/src/messages-panel.ts",
      "apps/widget/src/widget-styles.ts",
      "apps/widget/src/shadow-host.ts",
      "apps/api/src/routes/widget.ts",
      "apps/api/src/routes/widget-ws.ts",
    ],
    contains: [["apps/widget/src/widget-styles.ts", "--widget-user-bubble"]],
  },
  {
    id: "tickets-customer-portal",
    label: "Tickets and customer portal",
    weight: 8,
    paths: [
      "apps/dashboard/src/app/tickets/page.tsx",
      "apps/dashboard/src/app/tickets/[id]/page.tsx",
      "apps/portal/src/app/tickets/[id]/page.tsx",
      "apps/api/src/routes/tickets.ts",
      "apps/api/src/routes/portal.ts",
    ],
  },
  {
    id: "analytics-resource-links",
    label: "Analytics and resources",
    weight: 6,
    paths: [
      "apps/dashboard/src/app/analytics/page.tsx",
      "apps/dashboard/src/components/analytics/analytics-shell.tsx",
      "apps/api/src/routes/analytics.ts",
    ],
  },
  {
    id: "ai-copilot",
    label: "AI copilot entrypoints",
    weight: 8,
    paths: [
      "apps/dashboard/src/components/inbox/copilot-command.tsx",
      "apps/dashboard/src/components/inbox/message-thread.tsx",
      "apps/api/src/routes/copilot.ts",
      "packages/agent/src/index.ts",
    ],
    contains: [["apps/dashboard/src/components/inbox/message-thread.tsx", "Copilot"]],
  },
  {
    id: "custom-actions-mcp",
    label: "Custom actions and MCP",
    weight: 5,
    paths: [
      "apps/dashboard/src/app/custom-actions/page.tsx",
      "apps/dashboard/src/components/custom-actions/custom-actions-shell.tsx",
      "apps/api/src/routes/custom-actions.ts",
      "apps/api/src/routes/mcp.ts",
      "packages/mcp/src/host.ts",
    ],
  },
  {
    id: "design-system-tokens",
    label: "Dark-first design system tokens",
    weight: 11,
    paths: [
      "apps/dashboard/src/app/globals.css",
      "apps/portal/src/app/globals.css",
      "apps/widget/src/widget-styles.ts",
      "packages/ui/src/styles/globals.css",
    ],
    contains: [
      ["apps/dashboard/src/app/globals.css", "--surface-0"],
      ["apps/dashboard/src/app/globals.css", "--primary"],
      ["packages/ui/src/styles/globals.css", "--widget-user-bubble"],
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

function fileContains(relativePath, needle) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf8").includes(needle);
}

function evaluateCriterion(criterion) {
  const missingPaths = criterion.paths.filter((path) => !existsSync(join(ROOT, path)));
  const missingContent = (criterion.contains ?? [])
    .filter(([path, needle]) => !fileContains(path, needle))
    .map(([path, needle]) => `${path} missing ${needle}`);
  const passed = missingPaths.length === 0 && missingContent.length === 0;
  return {
    ...criterion,
    passed,
    missingPaths,
    missingContent,
  };
}

function renderMarkdown(report) {
  const rows = report.criteria
    .map(
      (item) =>
        `| ${item.id} | ${item.passed ? "pass" : "fail"} | ${item.weight} | ${
          item.missingPaths.length + item.missingContent.length === 0
            ? "none"
            : [...item.missingPaths, ...item.missingContent].join("; ")
        } |`,
    )
    .join("\n");

  return [
    "# Featurebase Parity Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| source_doc | ${report.sourceDoc} |`,
    `| score | ${(report.score * 100).toFixed(1)}% |`,
    `| threshold | ${(report.threshold * 100).toFixed(1)}% |`,
    `| passed_weight | ${report.passedWeight} |`,
    `| total_weight | ${report.totalWeight} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Criteria",
    "",
    "| ID | Status | Weight | Missing |",
    "|----|--------|--------|---------|",
    rows,
    "",
  ].join("\n");
}

const evaluated = criteria.map(evaluateCriterion);
const totalWeight = evaluated.reduce((sum, item) => sum + item.weight, 0);
const passedWeight = evaluated
  .filter((item) => item.passed)
  .reduce((sum, item) => sum + item.weight, 0);
const score = totalWeight > 0 ? passedWeight / totalWeight : 0;
const failures = evaluated
  .filter((item) => !item.passed)
  .map((item) => item.id)
  .concat(score < THRESHOLD ? [`score ${score.toFixed(3)} < ${THRESHOLD}`] : []);
const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length === 0 ? "pass" : "fail",
  sourceDoc: "docs/05-FRONTEND.md",
  threshold: THRESHOLD,
  score,
  passedWeight,
  totalWeight,
  criteria: evaluated,
  failures,
};

const jsonPath = outputPath("FEATUREBASE_PARITY_REPORT_JSON_OUT", "featurebase-parity.json");
const markdownPath = outputPath("FEATUREBASE_PARITY_REPORT_MD", "featurebase-parity.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
