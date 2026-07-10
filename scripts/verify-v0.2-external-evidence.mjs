#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const DEFAULT_MANIFEST = "artifacts/release/v0.2.0-external-evidence.json";

const BASE_URL_FIELDS = [
  ["remoteCiRunUrl", "remote CI run URL"],
  ["deployedKbBench.url", "deployed API kb:bench evidence URL"],
  ["helm.installArtifactUrl", "Helm install artifact URL"],
  ["githubReleaseUrl", "GitHub Release URL"],
];

const BASE_TEXT_FIELDS = [
  ["tag", "release tag"],
  ["ghcr.apiImage", "GHCR API image ref"],
  ["ghcr.dashboardImage", "GHCR Dashboard image ref"],
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

function checkUrlField(manifest, path, label, failures) {
  checkUrl(get(manifest, path), label, failures);
}

function checkTextField(manifest, path, label, failures) {
  checkText(get(manifest, path), label, failures);
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

function checkSelfHostedTutorial(manifest, failures) {
  checkUrlField(
    manifest,
    "tutorials.selfHosted.youtubeUrl",
    "self-hosted YouTube tutorial URL",
    failures,
  );
  checkUrlField(
    manifest,
    "tutorials.selfHosted.bilibiliUrl",
    "self-hosted Bilibili tutorial URL",
    failures,
  );
}

function checkAllTutorials(manifest, failures) {
  checkSelfHostedTutorial(manifest, failures);
  checkUrlField(
    manifest,
    "tutorials.kbImport.youtubeUrl",
    "KB import/eval YouTube tutorial URL",
    failures,
  );
  checkUrlField(
    manifest,
    "tutorials.kbImport.bilibiliUrl",
    "KB import/eval Bilibili tutorial URL",
    failures,
  );
}

function checkRunningEnvironment(manifest, failures) {
  checkUrlField(
    manifest,
    "runningEnvironment.supportDogfoodUrl",
    "running-environment support dogfood evidence URL",
    failures,
  );
}

function checkCustomerReachability(manifest, failures) {
  checkUrlField(
    manifest,
    "runningEnvironment.customerReachabilityUrl",
    "running-environment customer reachability evidence URL",
    failures,
  );
}

function checkFeaturebaseParity(manifest, failures) {
  checkUrlField(
    manifest,
    "featurebaseParity.artifactUrl",
    "Featurebase parity artifact URL",
    failures,
  );
}

function checkLiveSourceConnectors(manifest, failures) {
  checkUrlField(
    manifest,
    "liveSourceConnectors.githubOAuthArtifactUrl",
    "GitHub source OAuth evidence URL",
    failures,
  );
  checkUrlField(
    manifest,
    "liveSourceConnectors.notionOAuthArtifactUrl",
    "Notion source OAuth evidence URL",
    failures,
  );
}

function checkOllamaRuntime(manifest, failures) {
  checkUrlField(
    manifest,
    "ollamaOffline.realRuntimeArtifactUrl",
    "real Ollama runtime evidence URL",
    failures,
  );
  checkTextField(manifest, "ollamaOffline.model", "real Ollama runtime model", failures);
}

const BLOCKER_CHECKS = [
  {
    id: "P1-11",
    label: "Fumadocs user docs + Quickstart video",
    check: checkSelfHostedTutorial,
  },
  {
    id: "P1-ACC-01",
    label: "Internal support end-to-end",
    check: checkRunningEnvironment,
  },
  {
    id: "P1-ACC-02",
    label: "Widget + Email customer reachability",
    check: checkCustomerReachability,
  },
  {
    id: "P1-ACC-03",
    label: "Copilot adoption >= 30%",
    check(manifest, failures) {
      checkUrlField(
        manifest,
        "copilotAdoption.artifactUrl",
        "Copilot adoption artifact URL",
        failures,
      );
      checkCopilotAdoption(manifest, failures);
    },
  },
  {
    id: "P1-ACC-04",
    label: "Docker lite startup < 30s",
    check(manifest, failures) {
      checkUrlField(
        manifest,
        "dockerLiteStartup.artifactUrl",
        "Docker lite startup artifact URL",
        failures,
      );
      checkDockerStartup(manifest, failures);
    },
  },
  {
    id: "P1-ACC-06",
    label: "Coverage >= 70% and CI green rate >= 95%",
    check(manifest, failures) {
      checkUrlField(manifest, "ciGreenRate.url", "CI green-rate evidence URL", failures);
      checkCiGreenRate(manifest, failures);
    },
  },
  {
    id: "P2-ACC-01",
    label: "Featurebase 60% parity",
    check: checkFeaturebaseParity,
  },
  {
    id: "P2-ACC-02",
    label: "At least three external teams",
    check(manifest, failures) {
      checkUrlField(
        manifest,
        "externalTeams.artifactUrl",
        "external teams trial evidence URL",
        failures,
      );
      checkExternalTeams(manifest, failures);
    },
  },
  {
    id: "P3-12",
    label: "YouTube / Bilibili tutorial videos",
    check: checkAllTutorials,
  },
  {
    id: "P3-13",
    label: "KB production depth",
    check(manifest, failures) {
      checkTelemetry(manifest, failures);
      checkLiveSourceConnectors(manifest, failures);
    },
  },
  {
    id: "P3-ACC-01",
    label: "Auto resolution >= 50%",
    check(manifest, failures) {
      checkUrlField(
        manifest,
        "autoResolution.artifactUrl",
        "auto resolution artifact URL",
        failures,
      );
      checkAutoResolution(manifest, failures);
    },
  },
  {
    id: "P3-ACC-02",
    label: "Ollama fully offline demo",
    check: checkOllamaRuntime,
  },
  {
    id: "P3-ACC-03",
    label: "Featurebase 90% parity",
    check: checkFeaturebaseParity,
  },
  {
    id: "P3-ACC-04",
    label: "Mastra Eval faithfulness >= 0.85",
    check: checkTelemetry,
  },
  {
    id: "P3-ACC-05",
    label: "Recall@5 and stale answer thresholds",
    check: checkTelemetry,
  },
];

function checkBlocker(manifest, blocker, failures) {
  const blockerFailures = [];
  blocker.check(manifest, blockerFailures);
  for (const failure of blockerFailures) {
    failures.push(`${blocker.id}: ${failure}`);
  }
}

function verify(manifest) {
  const failures = [];

  for (const [path, label] of BASE_URL_FIELDS) checkUrl(get(manifest, path), label, failures);
  for (const [path, label] of BASE_TEXT_FIELDS) checkText(get(manifest, path), label, failures);

  if (get(manifest, "tag") !== "v0.2.0") failures.push("tag must be v0.2.0");
  checkDeployedBench(manifest, failures);
  checkImages(manifest, failures);
  for (const blocker of BLOCKER_CHECKS) checkBlocker(manifest, blocker, failures);

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
