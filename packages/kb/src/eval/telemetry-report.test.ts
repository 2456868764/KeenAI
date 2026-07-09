import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbQueryLogs, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKbTelemetryReport,
  checkKbTelemetryThresholds,
  renderKbTelemetryMarkdown,
} from "./telemetry-report.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../storage/migrations/libsql",
);

const stores: Array<ReturnType<typeof createLibsqlStore>> = [];

async function createFixtureDb() {
  const store = createLibsqlStore({ url: ":memory:" });
  stores.push(store);
  const db = store.db;
  await migrate(db, { migrationsFolder });

  const [org] = await db
    .insert(organizations)
    .values({ slug: `telemetry-${stores.length}`, name: "Telemetry" })
    .returning();
  if (!org) throw new Error("org missing");

  const [brand] = await db
    .insert(brands)
    .values({ orgId: org.id, slug: "default", name: "Default" })
    .returning();
  if (!brand) throw new Error("brand missing");

  return { db, org, brand };
}

describe("buildKbTelemetryReport", () => {
  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
  });

  it("summarizes query log feedback, retrieval, and latency for release evidence", async () => {
    const { db, org, brand } = await createFixtureDb();
    const since = new Date("2026-07-01T00:00:00.000Z");
    const generatedAt = new Date("2026-07-08T12:00:00.000Z");
    const rows = [
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "billing invoice",
        retrievedChunkIds: ["c1", "c2"],
        scores: [0.9, 0.7],
        latencyMs: 10,
        userFeedback: "helpful" as const,
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      },
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "refund policy",
        retrievedChunkIds: ["c3"],
        scores: [0.8],
        latencyMs: 20,
        userFeedback: "helpful" as const,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      },
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "shipping",
        retrievedChunkIds: [],
        scores: [],
        latencyMs: 30,
        createdAt: new Date("2026-07-04T00:00:00.000Z"),
      },
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "password reset",
        retrievedChunkIds: ["c4", "c5", "c6"],
        scores: [0.8, 0.6, 0.4],
        latencyMs: 40,
        userFeedback: "helpful" as const,
        createdAt: new Date("2026-07-05T00:00:00.000Z"),
      },
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "old query",
        retrievedChunkIds: ["old"],
        scores: [0.5],
        latencyMs: 5000,
        userFeedback: "not_helpful" as const,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ];

    await db.insert(kbQueryLogs).values(rows);

    const report = await buildKbTelemetryReport(db, {
      orgId: org.id,
      brandId: brand.id,
      since,
      generatedAt,
      thresholds: {
        minFeedbackRate: 0.5,
        p95LatencyMsMax: 100,
      },
    });

    expect(report).toMatchObject({
      generatedAt: generatedAt.toISOString(),
      totalQueries: 4,
      helpfulCount: 3,
      notHelpfulCount: 0,
      withFeedback: 3,
      helpfulRate: 1,
      feedbackCoverageRate: 0.75,
      staleAnswerRate: 0,
      emptyResultCount: 1,
      emptyResultRate: 0.25,
      avgRetrievedChunks: 1.5,
      latency: {
        observedCount: 4,
        avgMs: 25,
        p50Ms: 20,
        p95Ms: 40,
        p99Ms: 40,
        maxMs: 40,
      },
      evidenceStatus: "passed",
      passed: true,
      failures: [],
    });
    expect(renderKbTelemetryMarkdown(report)).toContain("| status | passed |");
  });

  it("marks reports insufficient when sample or feedback coverage is too weak", async () => {
    const { db, org, brand } = await createFixtureDb();
    await db.insert(kbQueryLogs).values({
      orgId: org.id,
      brandId: brand.id,
      queryText: "billing",
      retrievedChunkIds: ["c1"],
      scores: [0.9],
      latencyMs: 12,
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    const report = await buildKbTelemetryReport(db, {
      orgId: org.id,
      brandId: brand.id,
      thresholds: {
        minQueries: 5,
        minFeedbackRate: 0.5,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.evidenceStatus).toBe("insufficient_data");
    expect(report.failures).toEqual([
      expect.stringContaining("total_queries"),
      expect.stringContaining("feedback_coverage"),
    ]);
  });

  it("fails reports when stale-answer proxy or latency breach release thresholds", async () => {
    const { db, org, brand } = await createFixtureDb();
    await db.insert(kbQueryLogs).values([
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "wrong refund answer",
        retrievedChunkIds: ["c1"],
        scores: [0.5],
        latencyMs: 700,
        userFeedback: "not_helpful" as const,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      },
      {
        orgId: org.id,
        brandId: brand.id,
        queryText: "billing",
        retrievedChunkIds: ["c2"],
        scores: [0.9],
        latencyMs: 120,
        userFeedback: "helpful" as const,
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    ]);

    const report = await buildKbTelemetryReport(db, {
      orgId: org.id,
      brandId: brand.id,
      thresholds: {
        minFeedbackRate: 1,
        staleAnswerRateMax: 0.02,
        p95LatencyMsMax: 500,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.evidenceStatus).toBe("failed");
    expect(report.topNotHelpfulQueries).toEqual([
      expect.objectContaining({
        queryText: "wrong refund answer",
        latencyMs: 700,
        retrievedChunkIds: ["c1"],
      }),
    ]);
    expect(report.failures).toEqual([
      expect.stringContaining("stale_answer_rate"),
      expect.stringContaining("latency_p95_ms"),
    ]);

    expect(
      checkKbTelemetryThresholds(report, {
        minQueries: 1,
        minFeedbackRate: 1,
        staleAnswerRateMax: 0.8,
        p95LatencyMsMax: 800,
      }),
    ).toMatchObject({ passed: true, evidenceStatus: "passed" });
  });
});
