import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const COMPOSE_FILE = join(ROOT, "docker-compose.yml");
const API_HEALTH_URL = process.env.DOCKER_LITE_API_HEALTH_URL ?? "http://127.0.0.1:8090/health";
const DB_HEALTH_URL =
  process.env.DOCKER_LITE_DB_HEALTH_URL ?? "http://127.0.0.1:8090/api/v1/health";
const STARTUP_THRESHOLD_MS = Number(process.env.DOCKER_LITE_STARTUP_THRESHOLD_MS ?? 30_000);
const DB_THRESHOLD_MS = Number(process.env.DOCKER_LITE_DB_THRESHOLD_MS ?? 5_000);
const TIMEOUT_MS = Number(process.env.DOCKER_LITE_STARTUP_TIMEOUT_MS ?? 120_000);
const DRY_RUN =
  process.argv.includes("--dry-run") || process.env.DOCKER_LITE_STARTUP_DRY_RUN === "true";
const CLEANUP = process.env.DOCKER_LITE_STARTUP_CLEANUP === "true";

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function elapsedMs(start) {
  return Math.round(performance.now() - start);
}

function validateComposeLiteConfig() {
  const text = readFileSync(COMPOSE_FILE, "utf8");
  const checks = [
    {
      id: "lite_profile",
      passed: text.includes('profiles: ["lite"]'),
      detail: 'service declares profiles: ["lite"]',
    },
    {
      id: "lite_dockerfile",
      passed: text.includes("infra/docker/Dockerfile.lite"),
      detail: "lite service builds infra/docker/Dockerfile.lite",
    },
    {
      id: "api_port",
      passed: text.includes('"8090:8090"') && text.includes('PORT: "8090"'),
      detail: "lite API exposes port 8090",
    },
    {
      id: "local_db",
      passed: text.includes("DATABASE_URL: file:/data/keenai.db"),
      detail: "lite profile uses local file database",
    },
    {
      id: "container_healthcheck",
      passed: text.includes("http://127.0.0.1:8090/health"),
      detail: "container healthcheck targets /health",
    },
  ];
  return { checks, passed: checks.every((check) => check.passed) };
}

async function checkDockerAvailable() {
  try {
    await execFileAsync("docker", ["compose", "version"], { cwd: ROOT });
    return { available: true };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForOk(url, start, timeoutMs) {
  let lastError = "not_attempted";
  while (performance.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return { ok: true, elapsedMs: elapsedMs(start), status: response.status };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return { ok: false, elapsedMs: elapsedMs(start), error: lastError };
}

function renderMarkdown(report) {
  const checks = report.compose.checks
    .map((check) => `| ${check.id} | ${check.passed ? "pass" : "fail"} | ${check.detail} |`)
    .join("\n");
  return [
    "# Docker Lite Startup Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| startup_threshold_ms | ${report.thresholds.startupMs} |`,
    `| db_threshold_ms | ${report.thresholds.dbMs} |`,
    `| docker_available | ${report.docker.available ? "yes" : "no"} |`,
    `| api_health_ms | ${report.timing.apiHealthMs ?? "n/a"} |`,
    `| db_health_ms | ${report.timing.dbHealthMs ?? "n/a"} |`,
    `| db_after_api_ms | ${report.timing.dbAfterApiMs ?? "n/a"} |`,
    `| cleanup | ${report.cleanup ? "yes" : "no"} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Compose Checks",
    "",
    "| Check | Status | Detail |",
    "|-------|--------|--------|",
    checks,
    "",
  ].join("\n");
}

async function buildDryRunReport() {
  const compose = validateComposeLiteConfig();
  const docker = await checkDockerAvailable();
  const failures = compose.checks
    .filter((check) => !check.passed)
    .map((check) => `compose_${check.id}_failed`);
  return {
    generatedAt: new Date().toISOString(),
    evidenceStatus: failures.length === 0 ? "dry_run" : "fail",
    mode: "dry_run",
    compose,
    docker,
    thresholds: { startupMs: STARTUP_THRESHOLD_MS, dbMs: DB_THRESHOLD_MS },
    timing: {},
    cleanup: false,
    failures,
  };
}

async function buildActualReport() {
  const compose = validateComposeLiteConfig();
  const docker = await checkDockerAvailable();
  const failures = compose.checks
    .filter((check) => !check.passed)
    .map((check) => `compose_${check.id}_failed`);
  if (!docker.available) failures.push("docker_compose_unavailable");

  const timing = {};
  const start = performance.now();

  if (docker.available && failures.length === 0) {
    try {
      await execFileAsync("docker", ["compose", "--profile", "lite", "up", "--build", "-d"], {
        cwd: ROOT,
        maxBuffer: 1024 * 1024 * 10,
      });
      timing.composeUpMs = elapsedMs(start);

      const apiHealth = await waitForOk(API_HEALTH_URL, start, TIMEOUT_MS);
      timing.apiHealthMs = apiHealth.ok ? apiHealth.elapsedMs : null;
      if (!apiHealth.ok) failures.push(`api_health_timeout:${apiHealth.error}`);

      const dbHealth = await waitForOk(DB_HEALTH_URL, start, TIMEOUT_MS);
      timing.dbHealthMs = dbHealth.ok ? dbHealth.elapsedMs : null;
      if (!dbHealth.ok) failures.push(`db_health_timeout:${dbHealth.error}`);

      if (timing.apiHealthMs !== null && timing.apiHealthMs > STARTUP_THRESHOLD_MS) {
        failures.push(`startup_ms ${timing.apiHealthMs} > ${STARTUP_THRESHOLD_MS}`);
      }
      if (timing.apiHealthMs !== null && timing.dbHealthMs !== null) {
        timing.dbAfterApiMs = Math.max(0, timing.dbHealthMs - timing.apiHealthMs);
        if (timing.dbAfterApiMs > DB_THRESHOLD_MS) {
          failures.push(`db_after_api_ms ${timing.dbAfterApiMs} > ${DB_THRESHOLD_MS}`);
        }
      }
    } catch (error) {
      failures.push(`docker_compose_up_failed:${error instanceof Error ? error.message : error}`);
    } finally {
      if (CLEANUP) {
        try {
          await execFileAsync("docker", ["compose", "--profile", "lite", "down"], { cwd: ROOT });
        } catch (error) {
          failures.push(
            `docker_compose_down_failed:${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    evidenceStatus: failures.length === 0 ? "pass" : "fail",
    mode: "actual",
    compose,
    docker,
    thresholds: { startupMs: STARTUP_THRESHOLD_MS, dbMs: DB_THRESHOLD_MS },
    timing,
    cleanup: CLEANUP,
    failures,
  };
}

const report = DRY_RUN ? await buildDryRunReport() : await buildActualReport();
const jsonPath = outputPath("DOCKER_LITE_STARTUP_REPORT_JSON_OUT", "docker-lite-startup.json");
const markdownPath = outputPath("DOCKER_LITE_STARTUP_REPORT_MD", "docker-lite-startup.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
