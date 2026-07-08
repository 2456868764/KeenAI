import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  kbCandidates,
  kbChunks,
  kbDocuments,
  kbSources,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import {
  assessKbCrystallizeQuality,
  gateKbCrystallizeQuality,
  runKbCrystallization,
  scoreKbCrystallizeQuality,
} from "./crystallize.js";

describe("KB-19 crystallize", () => {
  it("gates quality into auto, candidate, or memory_only", () => {
    expect(gateKbCrystallizeQuality(0.9, { autoMin: 0.8, candidateMin: 0.6 })).toBe("auto_index");
    expect(gateKbCrystallizeQuality(0.7, { autoMin: 0.8, candidateMin: 0.6 })).toBe("candidate");
    expect(gateKbCrystallizeQuality(0.5, { autoMin: 0.8, candidateMin: 0.6 })).toBe("memory_only");
    expect(
      scoreKbCrystallizeQuality({
        csatScore: 5,
        question: "How do I export billing data?",
        answer:
          "Open Settings, choose Billing exports, select the date range, and click Export. The CSV is emailed to workspace admins after the export finishes.",
        entities: ["billing", "export", "csv", "workspace"],
        extractSource: "llm",
      }),
    ).toBeGreaterThan(0.8);
  });

  it("penalizes weak or escalation-only answers before crystallization", () => {
    const assessment = assessKbCrystallizeQuality({
      csatScore: 5,
      question: "How do I export billing data?",
      answer: "Contact support.",
      entities: ["billing"],
    });

    expect(assessment.score).toBeLessThan(0.6);
    expect(assessment.reasons).toContain("answer_uncertain_or_escalates");
  });

  it("persists candidate when quality is mid-band", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "cryst", name: "Cryst" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    await db.insert(kbSources).values({
      orgId: org?.id ?? "",
      brandId: brand?.id,
      type: "resolved_conversations",
      name: "Past",
      config: {
        kbSchema: { qualityGates: { crystallizeAutoMin: 0.95, crystallizeCandidateMin: 0.5 } },
      },
    });

    const result = await runKbCrystallization(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conversationId: "conv1",
      csatScore: 4,
      question: "How do I export data?",
      answer: "Open settings and click export.",
    });

    expect(result.gate).toBe("candidate");
    const rows = await db
      .select()
      .from(kbCandidates)
      .where(eq(kbCandidates.conversationId, "conv1"));
    expect(rows[0]?.status).toBe("pending");

    await store.close();
  });

  it("keeps low-quality extracts out of KB candidates and auto-indexing", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "cryst-low", name: "Cryst Low" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    await db.insert(kbSources).values({
      orgId: org?.id ?? "",
      brandId: brand?.id,
      type: "resolved_conversations",
      name: "Past",
      config: {},
    });

    const result = await runKbCrystallization(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conversationId: "conv-low",
      csatScore: 5,
      question: "How do I export data?",
      answer: "Contact support.",
    });

    expect(result.gate).toBe("memory_only");
    expect(result.extract.qualityReasons).toContain("answer_uncertain_or_escalates");
    const rows = await db
      .select()
      .from(kbCandidates)
      .where(eq(kbCandidates.conversationId, "conv-low"));
    expect(rows).toHaveLength(0);

    await store.close();
  });

  it("downgrades auto-indexable extracts to candidate when KB reconcile finds conflicts", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "cryst-conflict", name: "Cryst Conflict" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [source] = await db
      .insert(kbSources)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id,
        type: "resolved_conversations",
        name: "Past",
        config: {},
      })
      .returning();
    const [doc] = await db
      .insert(kbDocuments)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id,
        sourceId: source?.id ?? "",
        title: "Refund policy",
        rawContent: "Refunds are not available for paid plans.",
        contentType: "text/markdown",
        status: "active",
      })
      .returning();
    await db.insert(kbChunks).values({
      orgId: org?.id ?? "",
      brandId: brand?.id,
      documentId: doc?.id ?? "",
      chunkIndex: 0,
      content: "Refunds are not available for paid plans.",
      status: "active",
    });

    const result = await runKbCrystallization(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conversationId: "conv-conflict",
      csatScore: 5,
      question: "Can customers request a refund for paid plans?",
      answer:
        "Customers can request a refund within 30 days from the dashboard. Open Billing, select the invoice, and click Request refund.",
      entities: ["refund", "paid plans", "dashboard", "billing"],
    });

    expect(result.requestedGate).toBe("auto_index");
    expect(result.gate).toBe("candidate");
    expect(result.proposalIds.length).toBeGreaterThan(0);
    const rows = await db
      .select()
      .from(kbCandidates)
      .where(eq(kbCandidates.conversationId, "conv-conflict"));
    expect(rows[0]?.metadata).toMatchObject({ requestedGate: "auto_index" });

    await store.close();
  });
});
