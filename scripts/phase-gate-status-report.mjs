import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const SOURCE_DOC = "docs/08-ROADMAP-TODO.md";
const ROADMAP_DOC = "docs/08-ROADMAP.md";
const PHASES = [
  { id: "phase-0", heading: "Phase 0", label: "Phase 0 · Engineering foundation" },
  { id: "phase-1", heading: "Phase 1", label: "Phase 1 · MVP" },
  { id: "phase-2", heading: "Phase 2", label: "Phase 2 · Core loop" },
  { id: "phase-3", heading: "Phase 3", label: "Phase 3 · AI full version" },
];

const statusMap = {
  "[x]": "done",
  "[~]": "partial",
  "[-]": "external_or_skipped",
  "[ ]": "todo",
};

const roadmapOpenMappings = [
  { includes: "用户文档", gateIds: ["P1-11"] },
  { includes: "内部客服可全程", gateIds: ["P1-ACC-01"] },
  { includes: "客户可通过 Widget", gateIds: ["P1-ACC-02"] },
  { includes: "AI Copilot 采纳率", gateIds: ["P1-ACC-03"] },
  { includes: "docker compose --profile lite", gateIds: ["P1-ACC-04"] },
  { includes: "bun create keenai", gateIds: ["P1-ACC-05"] },
  { includes: "GitHub Stars ≥ 500", gateIds: ["KPI-GITHUB-STARS-500"] },
  { includes: "70% 测试覆盖率", gateIds: ["P1-ACC-06"] },
  { includes: "所有 Block 实现", gateIds: ["P2-07"] },
  { includes: "Help Center Collections", gateIds: ["P2-14"] },
  { includes: "Featurebase 60%", gateIds: ["P2-ACC-01"] },
  { includes: "至少 3 个外部团队", gateIds: ["P2-ACC-02"] },
  { includes: "GitHub Stars ≥ 2000", gateIds: ["KPI-GITHUB-STARS-2000"] },
  { includes: "文档站访问 ≥ 1000", gateIds: ["KPI-DOCS-PV-1000"] },
  { includes: "视频教程", gateIds: ["P3-12"] },
  { includes: "v0.2.0 发布", gateIds: ["I120"] },
  { includes: "自动解决率 ≥ 50%", gateIds: ["P3-ACC-01"] },
  { includes: "Ollama 完全离线", gateIds: ["P3-ACC-02"] },
  { includes: "Featurebase 90%", gateIds: ["P3-ACC-03"] },
  { includes: "GitHub Stars ≥ 5000", gateIds: ["KPI-GITHUB-STARS-5000"] },
  { includes: "自托管实例数 ≥ 200", gateIds: ["KPI-SELF-HOSTED-200"] },
  { includes: "Mastra Eval faithfulness", gateIds: ["P3-ACC-04"] },
  { includes: "KB 优化 Phase A", gateIds: ["P3-13", "P3-ACC-05"] },
];

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function sectionForHeading(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith("### ") && line.includes(heading));
  if (start < 0) return "";
  const end = lines.findIndex(
    (line, index) => index > start && (line.startsWith("### ") || line.startsWith("## ")),
  );
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

function roadmapSectionForHeading(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith("## ") && line.includes(heading));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

function parseRows(section, phase) {
  return section
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("|----"))
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("| ID |"))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim());
      if (cells.length < 3) return null;
      const [id, item, statusCell] = cells;
      const code = statusCell.match(/\[(?:x|~|-| )\]/)?.[0] ?? "unknown";
      const state = statusMap[code] ?? "unknown";
      return {
        phase: phase.id,
        phaseLabel: phase.label,
        id,
        item,
        statusCode: code,
        state,
        evidence: statusCell.replace(code, "").trim(),
        releaseBlocking: state !== "done",
      };
    })
    .filter(Boolean);
}

function parseRoadmapChecklist(section, phase) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^-\s+\[([ xX~-])\]\s+(.+)$/);
      if (!match) return null;
      const marker = match[1].toLowerCase();
      const item = match[2].trim();
      const state =
        marker === "x"
          ? "done"
          : marker === "~"
            ? "partial"
            : marker === "-"
              ? "external_or_skipped"
              : "todo";
      return {
        phase: phase.id,
        phaseLabel: phase.label,
        item,
        state,
        releaseBlocking: state !== "done",
      };
    })
    .filter(Boolean);
}

function summarizePhase(phase, items) {
  const phaseItems = items.filter((item) => item.phase === phase.id);
  const counts = phaseItems.reduce(
    (acc, item) => {
      acc[item.state] = (acc[item.state] ?? 0) + 1;
      return acc;
    },
    { done: 0, partial: 0, external_or_skipped: 0, todo: 0, unknown: 0 },
  );
  const incomplete = phaseItems.filter((item) => item.releaseBlocking);

  return {
    id: phase.id,
    label: phase.label,
    total: phaseItems.length,
    counts,
    done: incomplete.length === 0,
    incompleteIds: incomplete.map((item) => item.id),
  };
}

function summarizeRoadmapPhase(phase, items) {
  const phaseItems = items.filter((item) => item.phase === phase.id);
  const incomplete = phaseItems.filter((item) => item.releaseBlocking);
  return {
    id: phase.id,
    label: phase.label,
    total: phaseItems.length,
    done: phaseItems.length - incomplete.length,
    incomplete: incomplete.length,
    incompleteItems: incomplete,
  };
}

function mapRoadmapOpenItems(openItems, todoItems) {
  const todoById = new Map(todoItems.map((item) => [item.id, item]));
  const mappings = [...roadmapOpenMappings].sort(
    (left, right) => right.includes.length - left.includes.length,
  );
  return openItems.map((item) => {
    const mapping = mappings.find((candidate) => item.item.includes(candidate.includes));
    const gateIds = mapping?.gateIds ?? [];
    const gateStates = gateIds.map((gateId) => {
      const gate = todoById.get(gateId);
      return {
        id: gateId,
        state: gate?.state ?? "roadmap_only",
        releaseBlocking: gate?.releaseBlocking ?? true,
      };
    });
    return {
      ...item,
      gateIds,
      gateStates,
      mapped: gateIds.length > 0,
      roadmapOnly: gateStates.some((gate) => gate.state === "roadmap_only"),
      todoDoneConflict: gateStates.some((gate) => gate.state === "done"),
    };
  });
}

function renderMarkdown(report) {
  const phaseRows = report.phases
    .map(
      (phase) =>
        `| ${phase.label} | ${phase.done ? "done" : "partial"} | ${phase.counts.done}/${phase.total} | ${
          phase.counts.partial
        } | ${phase.counts.external_or_skipped} | ${phase.counts.todo} | ${
          phase.incompleteIds.length > 0 ? phase.incompleteIds.join(", ") : "none"
        } |`,
    )
    .join("\n");

  const roadmapRows = report.roadmapPhases
    .map(
      (phase) =>
        `| ${phase.label} | ${phase.done}/${phase.total} | ${phase.incomplete} | ${
          phase.incompleteItems.length > 0
            ? phase.incompleteItems.map((item) => item.item).join("<br>")
            : "none"
        } |`,
    )
    .join("\n");

  const itemRows = report.items
    .map(
      (item) =>
        `| ${item.phaseLabel} | ${item.id} | ${item.state} | ${item.releaseBlocking ? "yes" : "no"} | ${
          item.item
        } | ${item.evidence || "n/a"} |`,
    )
    .join("\n");

  const mappingRows = report.roadmapOpenItemMappings
    .map(
      (item) =>
        `| ${item.phaseLabel} | ${item.item} | ${
          item.gateIds.length > 0 ? item.gateIds.join(", ") : "unmapped"
        } | ${
          item.gateStates.length > 0
            ? item.gateStates.map((gate) => `${gate.id}:${gate.state}`).join(", ")
            : "n/a"
        } | ${item.roadmapOnly ? "yes" : "no"} | ${item.todoDoneConflict ? "yes" : "no"} |`,
    )
    .join("\n");

  return [
    "# Phase 0-3 Gate Status Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| source_doc | ${report.sourceDoc} |`,
    `| roadmap_doc | ${report.roadmapDoc} |`,
    `| total_items | ${report.totalItems} |`,
    `| done_items | ${report.doneItems} |`,
    `| incomplete_items | ${report.incompleteItems.length} |`,
    `| roadmap_open_items | ${report.roadmapOpenItems.length} |`,
    `| roadmap_unmapped_open_items | ${report.roadmapUnmappedOpenItems.length} |`,
    `| roadmap_todo_done_conflicts | ${report.roadmapTodoDoneConflicts.length} |`,
    `| release_blockers | ${
      report.incompleteItems.length > 0
        ? report.incompleteItems.map((item) => item.id).join("; ")
        : "none"
    } |`,
    "",
    "## Phase Summary",
    "",
    "| Phase | Status | Done | Partial | External/Skipped | Todo | Incomplete IDs |",
    "|-------|--------|------|---------|------------------|------|----------------|",
    phaseRows,
    "",
    "## Roadmap Source Cross-check",
    "",
    `Source: ${report.roadmapDoc}`,
    "",
    "| Phase | Done | Open | Open roadmap items |",
    "|-------|------|------|--------------------|",
    roadmapRows,
    "",
    "## Roadmap Open Item Mapping",
    "",
    "| Phase | Raw roadmap item | Gate IDs | Gate states | Roadmap-only | TODO done conflict |",
    "|-------|------------------|----------|-------------|--------------|--------------------|",
    mappingRows,
    "",
    "## Required Items",
    "",
    "| Phase | ID | State | Release Blocking | Item | Evidence / Missing |",
    "|-------|----|-------|------------------|------|--------------------|",
    itemRows,
    "",
  ].join("\n");
}

const sourcePath = join(ROOT, SOURCE_DOC);
if (!existsSync(sourcePath)) {
  throw new Error(`Missing source doc: ${SOURCE_DOC}`);
}
const roadmapPath = join(ROOT, ROADMAP_DOC);
if (!existsSync(roadmapPath)) {
  throw new Error(`Missing roadmap doc: ${ROADMAP_DOC}`);
}

const markdown = readFileSync(sourcePath, "utf8");
const roadmapMarkdown = readFileSync(roadmapPath, "utf8");
const items = PHASES.flatMap((phase) =>
  parseRows(sectionForHeading(markdown, phase.heading), phase),
);
const roadmapItems = PHASES.flatMap((phase) =>
  parseRoadmapChecklist(roadmapSectionForHeading(roadmapMarkdown, phase.heading), phase),
);
const phases = PHASES.map((phase) => summarizePhase(phase, items));
const roadmapPhases = PHASES.map((phase) => summarizeRoadmapPhase(phase, roadmapItems));
const incompleteItems = items.filter((item) => item.releaseBlocking);
const roadmapOpenItems = roadmapItems.filter((item) => item.releaseBlocking);
const roadmapOpenItemMappings = mapRoadmapOpenItems(roadmapOpenItems, items);
const roadmapUnmappedOpenItems = roadmapOpenItemMappings.filter((item) => !item.mapped);
const roadmapTodoDoneConflicts = roadmapOpenItemMappings.filter((item) => item.todoDoneConflict);
const parseFailures = phases.filter((phase) => phase.total === 0).map((phase) => phase.id);
const roadmapParseFailures = roadmapPhases
  .filter((phase) => phase.total === 0)
  .map((phase) => phase.id);
const failures = [
  ...parseFailures.map((phaseId) => `missing ${phaseId} rows in ${SOURCE_DOC}`),
  ...roadmapParseFailures.map(
    (phaseId) => `missing ${phaseId} roadmap checkboxes in ${ROADMAP_DOC}`,
  ),
  ...items
    .filter((item) => item.state === "unknown")
    .map((item) => `${item.id} has unknown status`),
];

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus:
    failures.length > 0
      ? "fail"
      : incompleteItems.length > 0 || roadmapOpenItems.length > 0
        ? "partial"
        : "pass",
  sourceDoc: SOURCE_DOC,
  roadmapDoc: ROADMAP_DOC,
  totalItems: items.length,
  doneItems: items.filter((item) => item.state === "done").length,
  incompleteItems,
  phases,
  roadmapPhases,
  roadmapItems,
  roadmapOpenItems,
  roadmapOpenItemMappings,
  roadmapUnmappedOpenItems,
  roadmapTodoDoneConflicts,
  items,
  failures,
};

const jsonPath = outputPath("PHASE_GATE_STATUS_REPORT_JSON_OUT", "phase-gate-status.json");
const markdownPath = outputPath("PHASE_GATE_STATUS_REPORT_MD", "phase-gate-status.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
