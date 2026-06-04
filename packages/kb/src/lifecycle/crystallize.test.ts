import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbCandidates, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import {
  gateKbCrystallizeQuality,
  runKbCrystallization,
  scoreKbCrystallizeQuality,
} from "./crystallize.js";

describe("KB-19 crystallize", () => {
  it("gates quality into auto, candidate, or memory_only", () => {
    expect(gateKbCrystallizeQuality(0.9, { autoMin: 0.8, candidateMin: 0.6 })).toBe("auto_index");
    expect(gateKbCrystallizeQuality(0.7, { autoMin: 0.8, candidateMin: 0.6 })).toBe("candidate");
    expect(gateKbCrystallizeQuality(0.5, { autoMin: 0.8, candidateMin: 0.6 })).toBe("memory_only");
    expect(scoreKbCrystallizeQuality({ csatScore: 5, answer: "x".repeat(200) })).toBeGreaterThan(
      0.8,
    );
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
});
