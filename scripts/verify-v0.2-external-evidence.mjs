#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const DEFAULT_MANIFEST = "artifacts/release/v0.2.0-external-evidence.json";

const REQUIRED_URL_FIELDS = [
  ["remoteCiRunUrl", "remote CI run URL"],
  ["ciGreenRate.url", "CI green-rate evidence URL"],
  ["deployedKbBench.url", "deployed API kb:bench evidence URL"],
  ["helm.installArtifactUrl", "Helm install artifact URL"],
  ["runningEnvironment.supportDogfoodUrl", "running-environment support dogfood evidence URL"],
  [
    "runningEnvironment.customerReachabilityUrl",
    "running-environment customer reachability evidence URL",
  ],
  ["featurebaseParity.artifactUrl", "Featurebase parity artifact URL"],
  ["externalTeams.artifactUrl", "external teams trial evidence URL"],
  ["copilotAdoption.artifactUrl", "Copilot adoption artifact URL"],
  ["autoResolution.artifactUrl", "auto resolution artifact URL"],
  ["dockerLiteStartup.artifactUrl", "Docker lite startup artifact URL"],
  ["liveSourceConnectors.githubOAuthArtifactUrl", "GitHub source OAuth evidence URL"],
  ["liveSourceConnectors.notionOAuthArtifactUrl", "Notion source OAuth evidence URL"],
  ["ollamaOffline.realRuntimeArtifactUrl", "real Ollama runtime evidence URL"],
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
  ["ollamaOffline.model", "real Ollama runtime model"],
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
  const imageTag = isNonEmptyString(tag) ? tag.replace(/^v/, "") : tag;
  for (const [path, label] of [
    ["ghcr.apiImage", "GHCR API image ref"],
    ["ghcr.dashboardImage", "GHCR Dashboard image ref"],
  ]) {
    const value = get(manifest, path);
    if (
      isNonEmptyString(tag) &&
      isNonEmptyString(imageTag) &&
      isNonEmptyString(value) &&
      !value.includes(tag) &&
      !value.includes(imageTag)
    ) {
      failures.push(`${label} must include ${tag} or ${imageTag}`);
    }
  }
}

function checkCiGreenRate(manifest, failures) {
  const rate = get(manifest, "ciGreenRate.rate");
  const threshold = get(manifest, "ciGreenRate.threshold");
  if (typeof rate !== "number" || rate < 0 || rate > 1) {
    failures.push("CI green-rate must be a number between 0 and 1");
  }
  if (typeof threshold === "number" && typeof rate === "number" && rate < threshold) {
    failures.push(`CI green-rate ${rate} < threshold ${threshold}`);
  }
  if (typeof threshold !== "number" && typeof rate === "number" && rate < 0.95) {
    failures.push(`CI green-rate ${rate} < default threshold 0.95`);
  }
}

function checkExternalTeams(manifest, failures) {
  const count = get(manifest, "externalTeams.count");
  if (typeof count !== "number" || count < 3) {
    failures.push("external teams trial count must be >= 3");
  }
}

function checkJsonReport(path, label, failures) {
  checkFile(path, label, failures);
  if (!isNonEmptyString(path) || !existsSync(resolvePath(path))) return null;
  return loadJson(resolvePath(path));
}

function checkCopilotAdoption(manifest, failures) {
  const report = checkJsonReport(
    get(manifest, "copilotAdoption.reportJson"),
    "Copilot adoption report JSON",
    failures,
  );
  if (!report) return;
  if (report.evidenceStatus !== "pass") failures.push("Copilot adoption report must pass");
  if (report.mode !== "actual") failures.push("Copilot adoption report must be mode=actual");
  if (typeof report.totalEvents !== "number" || report.totalEvents < report.thresholds?.minEvents) {
    failures.push("Copilot adoption report must include enough production/prod-like events");
  }
  if (
    typeof report.acceptRate !== "number" ||
    report.acceptRate < (report.thresholds?.acceptRateMin ?? 0.3)
  ) {
    failures.push("Copilot adoption report acceptRate must meet threshold");
  }
}

function checkAutoResolution(manifest, failures) {
  const report = checkJsonReport(
    get(manifest, "autoResolution.reportJson"),
    "auto resolution report JSON",
    failures,
  );
  if (!report) return;
  if (report.evidenceStatus !== "pass") failures.push("auto resolution report must pass");
  if (report.mode !== "actual") failures.push("auto resolution report must be mode=actual");
  if (
    typeof report.totalClosedConversations !== "number" ||
    report.totalClosedConversations < report.thresholds?.minClosedConversations
  ) {
    failures.push("auto resolution report must include enough production/prod-like conversations");
  }
  if (
    typeof report.autoResolutionRate !== "number" ||
    report.autoResolutionRate < (report.thresholds?.autoResolutionRateMin ?? 0.5)
  ) {
    failures.push("auto resolution report autoResolutionRate must meet threshold");
  }
}

function checkDockerStartup(manifest, failures) {
  const report = checkJsonReport(
    get(manifest, "dockerLiteStartup.reportJson"),
    "Docker lite startup report JSON",
    failures,
  );
  if (!report) return;
  if (report.evidenceStatus !== "pass") failures.push("Docker lite startup report must pass");
  if (report.mode !== "actual") failures.push("Docker lite startup report must be mode=actual");
  const apiHealthMs = report.timing?.apiHealthMs;
  const dbAfterApiMs = report.timing?.dbAfterApiMs;
  if (typeof apiHealthMs !== "number" || apiHealthMs > (report.thresholds?.startupMs ?? 30_000)) {
    failures.push("Docker lite startup report apiHealthMs must meet threshold");
  }
  if (typeof dbAfterApiMs !== "number" || dbAfterApiMs > (report.thresholds?.dbMs ?? 5_000)) {
    failures.push("Docker lite startup report dbAfterApiMs must meet threshold");
  }
}

function verify(manifest) {
  const failures = [];

  for (const [path, label] of REQUIRED_URL_FIELDS) checkUrl(get(manifest, path), label, failures);
  for (const [path, label] of REQUIRED_TEXT_FIELDS) checkText(get(manifest, path), label, failures);

  if (get(manifest, "tag") !== "v0.2.0") failures.push("tag must be v0.2.0");
  checkCiGreenRate(manifest, failures);
  checkExternalTeams(manifest, failures);
  checkTelemetry(manifest, failures);
  checkDeployedBench(manifest, failures);
  checkImages(manifest, failures);
  checkCopilotAdoption(manifest, failures);
  checkAutoResolution(manifest, failures);
  checkDockerStartup(manifest, failures);

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
