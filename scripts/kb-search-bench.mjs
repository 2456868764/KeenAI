#!/usr/bin/env node
/**
 * Sprint 18 · autocannon load test for GET /api/v1/kb/search
 *
 * Usage (API must be running with seed data):
 *   pnpm dev
 *   pnpm db:migrate && pnpm seed
 *   pnpm kb:bench
 *
 * Env:
 *   BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_ORG_SLUG
 *   KB_BENCH_CONNECTIONS, KB_BENCH_DURATION, KB_BENCH_P95_MS_MAX
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import autocannon from "autocannon";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "packages/kb/config/kb-perf.yaml");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8090";
const EMAIL = process.env.SMOKE_EMAIL ?? "owner@keenai.local";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "keenai-demo-12";
const ORG_SLUG = process.env.SMOKE_ORG_SLUG ?? "demo";

function parsePerfYaml(text) {
  const config = {
    connections: 10,
    durationSec: 10,
    pipelining: 1,
    p95MsMax: 500,
    queries: [],
  };
  let section = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.endsWith(":") && !line.includes(" ")) {
      section = line.slice(0, -1);
      if (section === "kb_search") config.queries = [];
      continue;
    }
    if (section !== "kb_search") continue;

    const num = line.match(/:\s*([0-9.]+)/);
    if (line.startsWith("connections:") && num) config.connections = Number(num[1]);
    if (line.startsWith("duration_sec:") && num) config.durationSec = Number(num[1]);
    if (line.startsWith("pipelining:") && num) config.pipelining = Number(num[1]);
    if (line.startsWith("p95_ms_max:") && num) config.p95MsMax = Number(num[1]);
    if (line.startsWith("- ")) config.queries.push(line.slice(2).trim());
  }

  if (config.queries.length === 0) {
    config.queries = ["billing", "refund policy"];
  }
  return config;
}

function loadConfig() {
  try {
    return parsePerfYaml(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return parsePerfYaml("");
  }
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, orgSlug: ORG_SLUG }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`login failed HTTP ${res.status}: ${body}`);
  }
  const json = await res.json();
  const brandId = json.brandIds?.[0];
  if (!brandId) throw new Error("login response missing brandIds — run pnpm seed");
  return { token: json.accessToken, brandId };
}

function runAutocannon(url, headers, config) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url,
        headers,
        connections: Number(process.env.KB_BENCH_CONNECTIONS ?? config.connections),
        duration: Number(process.env.KB_BENCH_DURATION ?? config.durationSec),
        pipelining: config.pipelining,
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      },
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  const config = loadConfig();
  const p95Max = Number(process.env.KB_BENCH_P95_MS_MAX ?? config.p95MsMax);

  console.log(`KB search bench → ${BASE_URL}`);
  const { token, brandId } = await login();
  const headers = { Authorization: `Bearer ${token}` };

  const health = await fetch(`${BASE_URL}/api/v1/health`);
  if (!health.ok) {
    throw new Error(`API unhealthy HTTP ${health.status} — run pnpm db:migrate`);
  }

  let failed = false;
  for (const q of config.queries) {
    const url = `${BASE_URL}/api/v1/kb/search?brandId=${encodeURIComponent(brandId)}&q=${encodeURIComponent(q)}&limit=10&rerank=false`;
    console.log(`\n▶ query="${q}"`);
    const result = await runAutocannon(url, headers, config);
    const p50 = result.latency.p50;
    const p95 = result.latency.p95;
    const p99 = result.latency.p99;
    const rps = result.requests.average;
    console.log(
      `  requests=${result.requests.total} errors=${result.errors} ` +
        `p50=${p50}ms p95=${p95}ms p99=${p99}ms rps=${rps.toFixed(1)}`,
    );
    if (p95 > p95Max) {
      console.error(`  ✗ p95 ${p95}ms exceeds threshold ${p95Max}ms`);
      failed = true;
    } else {
      console.log(`  ✓ p95 within ${p95Max}ms`);
    }
  }

  if (failed) process.exit(1);
  console.log("\nKB bench passed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
