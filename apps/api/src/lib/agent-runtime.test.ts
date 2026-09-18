import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import {
  agentApprovals,
  agentPolicyDecisions,
  agentRunEvents,
  agentToolCalls,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createAgentRun, getAgentRunTrace } from "./agent-audit-store.js";
import { AgentApprovalRequiredError, wrapAuditedAgentTools } from "./agent-runtime.js";

describe("audited agent tool runtime", () => {
  it("pauses a high-risk call for approval and resumes the same idempotent call", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "audit-runtime", name: "Audit Runtime" })
      .returning();
    if (!org) throw new Error("org_create_failed");
    const run = await createAgentRun(store.db, {
      orgId: org.id,
      trigger: "test",
      actorType: "member",
      actorId: "member-1",
      inputSnapshot: { instruction: "Delete duplicate" },
    });
    let executions = 0;
    const [tool] = wrapAuditedAgentTools(
      store.db,
      { runId: run.id, orgId: org.id, actorId: "member-1", toolBudget: 2 },
      [
        {
          name: "records.delete",
          description: "Delete a duplicate record",
          parametersSchema: { type: "object" },
          audit: { source: "custom_action", riskLevel: "r3", idempotent: true },
          execute: async () => {
            executions += 1;
            return { deleted: true };
          },
        },
      ],
      [],
    );
    if (!tool) throw new Error("tool_missing");

    await expect(tool.execute({ id: "duplicate-1" })).rejects.toBeInstanceOf(
      AgentApprovalRequiredError,
    );
    expect(executions).toBe(0);
    const [approval] = await store.db
      .select()
      .from(agentApprovals)
      .where(eq(agentApprovals.runId, run.id));
    expect(approval?.status).toBe("pending");

    await store.db
      .update(agentApprovals)
      .set({ status: "approved", decidedAt: new Date(), decidedBy: "member-2" })
      .where(eq(agentApprovals.id, approval?.id ?? "missing"));
    await expect(tool.execute({ id: "duplicate-1" })).resolves.toEqual({ deleted: true });
    expect(executions).toBe(1);

    const calls = await store.db
      .select()
      .from(agentToolCalls)
      .where(eq(agentToolCalls.runId, run.id));
    const decisions = await store.db
      .select()
      .from(agentPolicyDecisions)
      .where(eq(agentPolicyDecisions.runId, run.id));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.status).toBe("succeeded");
    expect(decisions).toHaveLength(2);

    const validTrace = await getAgentRunTrace(store.db, org.id, run.id);
    expect(validTrace?.integrity).toEqual({ valid: true, checked: validTrace?.events.length });
    await store.db
      .update(agentRunEvents)
      .set({ payload: { tampered: true } })
      .where(eq(agentRunEvents.runId, run.id));
    const tamperedTrace = await getAgentRunTrace(store.db, org.id, run.id);
    expect(tamperedTrace?.integrity.valid).toBe(false);
    expect(tamperedTrace?.integrity.brokenAtSequence).toBe(1);
    await store.close();
  });
});
