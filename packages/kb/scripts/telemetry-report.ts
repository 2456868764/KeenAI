import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  type KbTelemetryThresholds,
  buildKbTelemetryReport,
  renderKbTelemetryMarkdown,
} from "../src/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function outputPath(envName: string, fallback: string): string {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const orgId = process.env.KB_TELEMETRY_ORG_ID;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!orgId) throw new Error("KB_TELEMETRY_ORG_ID is required");

  const thresholds: Partial<KbTelemetryThresholds> = {
    minQueries: optionalNumber(process.env.KB_TELEMETRY_MIN_QUERIES),
    minFeedbackRate: optionalNumber(process.env.KB_TELEMETRY_MIN_FEEDBACK_RATE),
    staleAnswerRateMax: optionalNumber(process.env.KB_TELEMETRY_STALE_RATE_MAX),
    p95LatencyMsMax: optionalNumber(process.env.KB_TELEMETRY_P95_MS_MAX),
  };

  const store = createLibsqlStore({
    url: databaseUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    if (process.env.KB_TELEMETRY_MIGRATE === "true") {
      await migrate(store.db, { migrationsFolder: MIGRATIONS_PATH });
    }

    const report = await buildKbTelemetryReport(store.db, {
      orgId,
      brandId: process.env.KB_TELEMETRY_BRAND_ID,
      since: optionalDate(process.env.KB_TELEMETRY_SINCE),
      until: optionalDate(process.env.KB_TELEMETRY_UNTIL),
      topFailuresLimit: optionalNumber(process.env.KB_TELEMETRY_TOP_FAILURES),
      thresholds,
    });

    const jsonPath = outputPath("KB_TELEMETRY_JSON", "kb-telemetry-report.json");
    const mdPath = outputPath("KB_TELEMETRY_MD", "kb-telemetry-report.md");
    writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeOutput(mdPath, `${renderKbTelemetryMarkdown(report)}\n`);

    console.log(`wrote ${jsonPath}`);
    console.log(`wrote ${mdPath}`);
    console.log(`status=${report.evidenceStatus} total_queries=${report.totalQueries}`);

    if (process.env.KB_TELEMETRY_STRICT === "true" && !report.passed) {
      process.exitCode = 1;
    }
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
