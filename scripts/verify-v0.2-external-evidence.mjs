#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const DEFAULT_MANIFEST = "artifacts/release/v0.2.0-external-evidence.json";

const REQUIRED_URL_FIELDS = [
  ["remoteCiRunUrl", "remote CI run URL"],
  ["deployedKbBench.url", "deployed API kb:bench evidence URL"],
  ["helm.installArtifactUrl", "Helm install artifact URL"],
  ["tutorials.selfHosted.youtubeUrl", "self-hosted YouTube tutorial URL"],
  ["tutorials.selfHosted.bilibiliUrl", "self-hosted Bilibili tutorial URL"],
  ["tutorials.kbImport.youtubeUrl", "KB import/eval YouTube tutorial URL"],
  ["tutorials.kbImport.bilibiliUrl", "KB import/eval Bilibili tutorial URL"],
  ["githubReleaseUrl", "GitHub Release URL"],
];

const REQUIRED_TEXT_FIELDS = [
  ["tag", "release tag"],
  ["ghcr.apiImage", "GHCR API image ref"],
  ["ghcr.dashboardImage", "GHCR Dashboard image ref"],
  ["externalKpis.adoptionEvidence", "adoption KPI evidence"],
  ["externalKpis.parityEvidence", "parity KPI evidence"],
  ["externalKpis.startupTimingEvidence", "startup timing evidence"],
];

function usage() {
  return [
    "Usage: node scripts/verify-v0.2-external-evidence.mjs [manifest.json]",
    "",
    `Default manifest: ${DEFAULT_MANIFEST}`,
    "Template: docs/releases/v0.2.0-external-evidence.example.json",
  ].join("\n");
}

function get(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return acc[key];
    return undefined;
  }, obj);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

function checkFile(value, label, failures) {
  if (!isNonEmptyString(value)) {
    failures.push(`${label} missing`);
    return;
  }
  if (!existsSync(resolvePath(value))) {
    failures.push(`${label} not found: ${value}`);
  }
}

function checkUrl(value, label, failures) {
  if (!isHttpUrl(value)) failures.push(`${label} must be an http(s) URL`);
}

function checkText(value, label, failures) {
  if (!isNonEmptyString(value)) failures.push(`${label} missing`);
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read ${path}: ${message}`);
  }
}

function checkTelemetry(manifest, failures) {
  const path = get(manifest, "productionTelemetry.reportJson");
  checkFile(path, "production telemetry report JSON", failures);
  if (!isNonEmptyString(path) || !existsSync(resolvePath(path))) return;

  const report = loadJson(resolvePath(path));
  if (report.evidenceStatus !== "passed" || report.passed !== true) {
    failures.push("production telemetry report must have evidenceStatus=passed and passed=true");
  }
  if (typeof report.totalQueries !== "number" || report.totalQueries <= 0) {
    failures.push("production telemetry report must include totalQueries > 0");
  }
}

function checkDeployedBench(manifest, failures) {
  const p95 = get(manifest, "deployedKbBench.p95Ms");
  if (typeof p95 !== "number" || p95 <= 0) {
    failures.push("deployed API kb:bench p95Ms must be a positive number");
  }
  const threshold = get(manifest, "deployedKbBench.thresholdMs");
  if (typeof threshold === "number" && typeof p95 === "number" && p95 > threshold) {
    failures.push(`deployed API kb:bench p95Ms ${p95} > thresholdMs ${threshold}`);
  }
}

function checkImages(manifest, failures) {
  const tag = get(manifest, "tag");
  for (const [path, label] of [
    ["ghcr.apiImage", "GHCR API image ref"],
    ["ghcr.dashboardImage", "GHCR Dashboard image ref"],
  ]) {
    const value = get(manifest, path);
    if (isNonEmptyString(tag) && isNonEmptyString(value) && !value.includes(tag)) {
      failures.push(`${label} must include ${tag}`);
    }
  }
}

function verify(manifest) {
  const failures = [];

  for (const [path, label] of REQUIRED_URL_FIELDS) checkUrl(get(manifest, path), label, failures);
  for (const [path, label] of REQUIRED_TEXT_FIELDS) checkText(get(manifest, path), label, failures);

  if (get(manifest, "tag") !== "v0.2.0") failures.push("tag must be v0.2.0");
  checkTelemetry(manifest, failures);
  checkDeployedBench(manifest, failures);
  checkImages(manifest, failures);

  return failures;
}

const arg = process.argv[2];
if (arg === "--help" || arg === "-h") {
  console.log(usage());
  process.exit(0);
}

const manifestPath = arg ?? process.env.V020_EXTERNAL_EVIDENCE ?? DEFAULT_MANIFEST;
const manifest = loadJson(resolvePath(manifestPath));
const failures = verify(manifest);

if (failures.length > 0) {
  console.error(`v0.2.0 external evidence failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`v0.2.0 external evidence verified: ${manifestPath}`);
