import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { agentRuns, agentToolCalls, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createAgentRun } from "./agent-audit-store.js";
import { recoverStaleAgentRuns } from "./agent-recovery.js";

describe("agent recovery", () => {
  it("makes idempotent calls retryable and escalates unknown non-idempotent outcomes", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../packages/storage/migrations/libsql",
      ),
    });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "agent-recovery", name: "Agent Recovery" })
      .returning();
    if (!org) throw new Error("org_missing");
    const first = await createAgentRun(store.db, {
      orgId: org.id,
      trigger: "test",
      actorType: "system",
      inputSnapshot: {},
    });
    const second = await createAgentRun(store.db, {
      orgId: org.id,
      trigger: "test",
      actorType: "system",
      inputSnapshot: {},
    });
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    await store.db.insert(agentToolCalls).values([
      {
        runId: first.id,
        orgId: org.id,
        toolName: "safe.get",
        toolSource: "mcp",
        riskLevel: "r0",
        status: "running",
        arguments: {},
        idempotencyKey: "safe-call",
        idempotent: true,
        startedAt,
      },
      {
        runId: second.id,
        orgId: org.id,
        toolName: "payment.send",
        toolSource: "mcp",
        riskLevel: "r3",
        status: "running",
        arguments: {},
        idempotencyKey: "unsafe-call",
        idempotent: false,
        startedAt,
      },
    ]);

    const result = await recoverStaleAgentRuns(store.db, {
      staleBefore: new Date("2026-01-01T00:10:00.000Z"),
      now: new Date("2026-01-01T00:15:00.000Z"),
    });
    expect(result).toMatchObject({ scanned: 2, retryable: 1, escalated: 1 });
    const calls = await store.db.select().from(agentToolCalls);
    expect(calls.find((call) => call.idempotent)?.status).toBe("failed");
    expect(calls.find((call) => !call.idempotent)?.status).toBe("outcome_unknown");
    const runs = await store.db.select().from(agentRuns);
    expect(runs.find((run) => run.id === first.id)?.status).toBe("failed");
    expect(runs.find((run) => run.id === second.id)?.status).toBe("escalated");
    await store.close();
  });
});
