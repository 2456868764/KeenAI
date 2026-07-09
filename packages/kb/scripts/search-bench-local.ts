/**
 * v0.2.0 local KB search bench.
 *
 * This exercises the KB domain search path without requiring a Bun API server:
 * sync help-center fixture -> index chunks -> run concurrent search calls.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createHelpCenterStubConnector,
  createKeenaiKb,
  createStubKbQueryEmbedder,
} from "../src/index.js";

type KbBenchConfig = {
  connections: number;
  durationSec: number;
  p95MsMax: number;
  queries: string[];
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

  if (config.queries.length === 0) {
    config.queries = ["billing", "refund policy"];
  }
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

async function main() {
  const config = loadConfig();
  const connections = Number(process.env.KB_BENCH_CONNECTIONS ?? config.connections);
  const durationSec = Number(process.env.KB_BENCH_DURATION ?? config.durationSec);
  const p95Max = Number(process.env.KB_BENCH_P95_MS_MAX ?? config.p95MsMax);

  const store = createLibsqlStore({ url: ":memory:" });
  const db = store.db;
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });

  const chunkFts = createLibsqlKbChunkFtsStore(store.client);
  const chunkVector = createLibsqlKbChunkVectorStore(store.client);
  const [org] = await db.insert(organizations).values({ slug: "bench", name: "Bench" }).returning();
  const [brand] = await db
    .insert(brands)
    .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
    .returning();
  const [source] = await db
    .insert(kbSources)
    .values({
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      type: "help_center",
      name: "Bench Help",
    })
    .returning();

  if (!org?.id || !brand?.id || !source?.id) {
    throw new Error("bench_fixture_insert_failed");
  }

  const kb = createKeenaiKb({ db });
  await kb.syncSource({
    orgId: org.id,
    brandId: brand.id,
    sourceId: source.id,
    connector: createHelpCenterStubConnector(),
  });
  const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
  for (const document of documents) {
    await kb.indexDocument({
      orgId: org.id,
      brandId: brand.id,
      documentId: document.id,
      chunkFtsIndexer: chunkFts,
    });
  }

  const queryEmbedder = createStubKbQueryEmbedder();
  let failed = false;

  console.log("KB local search bench");
  console.log(`  connections=${connections} duration=${durationSec}s p95_max=${p95Max}ms`);

  for (const query of config.queries) {
    const latencies: number[] = [];
    let requests = 0;
    let errors = 0;
    const deadline = performance.now() + durationSec * 1000;

    const worker = async () => {
      while (performance.now() < deadline) {
        const started = performance.now();
        try {
          await kb.search({
            orgId: org.id,
            brandId: brand.id,
            q: query,
            limit: 10,
            chunkFts,
            chunkVector,
            queryEmbedder,
            rerank: false,
          });
        } catch {
          errors += 1;
        } finally {
          requests += 1;
          latencies.push(performance.now() - started);
        }
      }
    };

    await Promise.all(Array.from({ length: connections }, () => worker()));

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);
    const rps = requests / durationSec;
    console.log(
      `  query="${query}" requests=${requests} errors=${errors} ` +
        `p50=${formatMs(p50)}ms p95=${formatMs(p95)}ms p99=${formatMs(p99)}ms rps=${rps.toFixed(
          1,
        )}`,
    );

    if (errors > 0 || p95 > p95Max) {
      failed = true;
      console.error(`  x p95 ${formatMs(p95)}ms exceeds threshold ${p95Max}ms or errors > 0`);
    } else {
      console.log(`  ok p95 within ${p95Max}ms`);
    }
  }

  await store.close();
  if (failed) process.exit(1);
  console.log("KB local bench passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
