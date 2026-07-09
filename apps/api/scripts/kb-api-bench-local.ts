import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type IncomingMessage, createServer } from "node:http";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { createHelpCenterStubConnector, createKeenaiKb } from "@keenai/kb";
import { parseApiEnv } from "@keenai/shared";
import {
  createLibsqlFtsStore,
  createLibsqlKbChunkFtsStore,
  createLibsqlStore,
  ensureFtsSchema,
} from "@keenai/storage";
import { accounts, brands, kbSources, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { toAuthConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

type KbBenchConfig = {
  connections: number;
  durationSec: number;
  p95MsMax: number;
  queries: string[];
};

type BenchQueryResult = {
  query: string;
  requests: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
  passed: boolean;
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIG_PATH = join(ROOT, "packages/kb/config/kb-perf.yaml");
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");

function parsePerfYaml(text: string): KbBenchConfig {
  const config: KbBenchConfig = {
    connections: 10,
    durationSec: 10,
    p95MsMax: 500,
    queries: [],
  };
  let section: string | null = null;

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
    if (line.startsWith("connections:") && num?.[1]) config.connections = Number(num[1]);
    if (line.startsWith("duration_sec:") && num?.[1]) config.durationSec = Number(num[1]);
    if (line.startsWith("p95_ms_max:") && num?.[1]) config.p95MsMax = Number(num[1]);
    if (line.startsWith("- ")) config.queries.push(line.slice(2).trim());
  }

  if (config.queries.length === 0) config.queries = ["billing", "refund policy"];
  return config;
}

function loadConfig(): KbBenchConfig {
  try {
    return parsePerfYaml(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return parsePerfYaml("");
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function formatMs(value: number): string {
  return value.toFixed(1);
}

function requestBody(req: IncomingMessage): BodyInit | undefined {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return Readable.toWeb(req) as ReadableStream;
}

async function createHttpServer(app: Hono) {
  const server = createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host ?? "127.0.0.1"}${req.url ?? "/"}`;
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: requestBody(req),
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      const response = await app.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (!response.body) {
        res.end();
        return;
      }
      Readable.fromWeb(response.body as ReadableStream).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("bench_server_bind_failed");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function seedBenchData() {
  const env = parseApiEnv({
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
    JWT_SECRET: "kb-api-bench-secret-at-least-32-chars",
    APP_URL: "http://localhost:3000",
    PORTAL_APP_URL: "http://localhost:3002",
    LOG_LEVEL: "error",
    RATE_LIMIT_MAX: "100000",
  });
  const store = createLibsqlStore({ url: ":memory:" });
  await migrate(store.db, { migrationsFolder: MIGRATIONS_PATH });
  await ensureFtsSchema(store.client);
  const fts = createLibsqlFtsStore(store.client);
  const app = createApp({
    store,
    fts,
    authConfig: toAuthConfig(env),
    env,
    log: createLogger(env),
    startedAt: new Date(),
  });

  const [org] = await store.db
    .insert(organizations)
    .values({ slug: "bench", name: "Bench" })
    .returning();
  const [brand] = await store.db
    .insert(brands)
    .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
    .returning();
  const [account] = await store.db
    .insert(accounts)
    .values({
      email: "bench@keenai.local",
      passwordHash: await hashPassword("keenai-demo-12"),
      name: "Bench Owner",
    })
    .returning();
  if (!org?.id || !brand?.id || !account?.id) throw new Error("bench_fixture_insert_failed");
  await store.db.insert(members).values({
    orgId: org.id,
    accountId: account.id,
    role: "owner",
    status: "active",
  });

  const [source] = await store.db
    .insert(kbSources)
    .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Bench Help" })
    .returning();
  if (!source?.id) throw new Error("bench_source_insert_failed");

  const kb = createKeenaiKb({ db: store.db });
  await kb.syncSource({
    orgId: org.id,
    brandId: brand.id,
    sourceId: source.id,
    connector: createHelpCenterStubConnector(),
  });
  const chunkFts = createLibsqlKbChunkFtsStore(store.client);
  const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
  for (const document of documents) {
    await kb.indexDocument({
      orgId: org.id,
      brandId: brand.id,
      documentId: document.id,
      chunkFtsIndexer: chunkFts,
    });
  }

  return { app, store };
}

async function login(baseUrl: string): Promise<{ token: string; brandId: string }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "bench@keenai.local",
      password: "keenai-demo-12",
      orgSlug: "bench",
    }),
  });
  if (!response.ok)
    throw new Error(`bench_login_failed:${response.status}:${await response.text()}`);
  const body = (await response.json()) as { accessToken?: string; brandIds?: string[] };
  const token = body.accessToken;
  const brandId = body.brandIds?.[0];
  if (!token || !brandId) throw new Error("bench_login_response_missing_fields");
  return { token, brandId };
}

async function runQueryBench(input: {
  baseUrl: string;
  token: string;
  brandId: string;
  query: string;
  connections: number;
  durationSec: number;
  p95Max: number;
}): Promise<BenchQueryResult> {
  const latencies: number[] = [];
  let requests = 0;
  let errors = 0;
  const deadline = performance.now() + input.durationSec * 1000;
  const url =
    `${input.baseUrl}/api/v1/kb/search?brandId=${encodeURIComponent(input.brandId)}` +
    `&q=${encodeURIComponent(input.query)}&limit=10&rerank=false`;

  const worker = async () => {
    while (performance.now() < deadline) {
      const started = performance.now();
      try {
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${input.token}` },
        });
        if (!response.ok) errors += 1;
        await response.arrayBuffer();
      } catch {
        errors += 1;
      } finally {
        requests += 1;
        latencies.push(performance.now() - started);
      }
    }
  };

  await Promise.all(Array.from({ length: input.connections }, () => worker()));
  const p50Ms = percentile(latencies, 50);
  const p95Ms = percentile(latencies, 95);
  const p99Ms = percentile(latencies, 99);
  return {
    query: input.query,
    requests,
    errors,
    p50Ms,
    p95Ms,
    p99Ms,
    rps: requests / input.durationSec,
    passed: errors === 0 && p95Ms <= input.p95Max,
  };
}

function writeEvidence(results: BenchQueryResult[], p95Max: number) {
  const outputDir = process.env.KB_API_BENCH_EVIDENCE_DIR ?? join(ROOT, "artifacts/release");
  const outputPath = join(outputDir, "kb-api-bench.md");
  mkdirSync(outputDir, { recursive: true });
  const body = [
    "# KB API Bench",
    "",
    `Generated: ${new Date().toISOString()}`,
    `P95 threshold: ${p95Max}ms`,
    "",
    "| Query | Requests | Errors | P50 ms | P95 ms | P99 ms | RPS | Status |",
    "|-------|----------|--------|--------|--------|--------|-----|--------|",
    ...results.map(
      (result) =>
        `| ${result.query} | ${result.requests} | ${result.errors} | ${formatMs(result.p50Ms)} | ${formatMs(
          result.p95Ms,
        )} | ${formatMs(result.p99Ms)} | ${result.rps.toFixed(1)} | ${
          result.passed ? "passed" : "failed"
        } |`,
    ),
    "",
  ].join("\n");
  writeFileSync(outputPath, body);
  return outputPath;
}

async function main() {
  const config = loadConfig();
  const connections = Number(process.env.KB_API_BENCH_CONNECTIONS ?? config.connections);
  const durationSec = Number(process.env.KB_API_BENCH_DURATION ?? config.durationSec);
  const p95Max = Number(process.env.KB_API_BENCH_P95_MS_MAX ?? config.p95MsMax);
  const { app, store } = await seedBenchData();
  const server = await createHttpServer(app as Hono);

  try {
    const { token, brandId } = await login(server.baseUrl);
    console.log("KB API bench");
    console.log(
      `  base_url=${server.baseUrl} connections=${connections} duration=${durationSec}s p95_max=${p95Max}ms`,
    );

    const results: BenchQueryResult[] = [];
    for (const query of config.queries) {
      const result = await runQueryBench({
        baseUrl: server.baseUrl,
        token,
        brandId,
        query,
        connections,
        durationSec,
        p95Max,
      });
      results.push(result);
      console.log(
        `  query="${query}" requests=${result.requests} errors=${result.errors} ` +
          `p50=${formatMs(result.p50Ms)}ms p95=${formatMs(result.p95Ms)}ms ` +
          `p99=${formatMs(result.p99Ms)}ms rps=${result.rps.toFixed(1)}`,
      );
    }

    const evidencePath = writeEvidence(results, p95Max);
    console.log(`wrote ${evidencePath}`);
    if (results.some((result) => !result.passed)) process.exitCode = 1;
  } finally {
    await server.close();
    await store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
