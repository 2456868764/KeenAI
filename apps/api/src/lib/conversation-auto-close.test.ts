import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  agentOtherSettings,
  agentRuns,
  brands,
  conversationAutoCloseJobs,
  conversations,
  messages,
  organizations,
  workflowRuns,
  workflows,
} from "@keenai/storage/schema";
import type { WorkflowDefinition } from "@keenai/workflow";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { toAuthConfig } from "../config.js";
import { createLogger } from "../logger.js";
import {
  reconcileAutoCloseJobsForSettings,
  runDueConversationAutoCloseJobs,
  scheduleResolvedConversationAutoClose,
  scheduleWorkflowAbandonedAutoClose,
  workflowTriggerMatchesAgentSetting,
} from "./conversation-auto-close.js";
import { insertMessage } from "./conversations.js";
import { executeWorkflow } from "./workflow-engine.js";
import { resumeCollectDataWorkflow } from "./workflow-resume.js";

async function createFixture() {
  const store = createLibsqlStore({ url: ":memory:" });
  await migrate(store.db, {
    migrationsFolder: path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/storage/migrations/libsql",
    ),
  });
  const [org] = await store.db
    .insert(organizations)
    .values({ slug: `auto-close-${crypto.randomUUID()}`, name: "Auto Close" })
    .returning();
  if (!org) throw new Error("org_missing");
  const [brand] = await store.db
    .insert(brands)
    .values({ orgId: org.id, slug: "default", name: "Default" })
    .returning();
  if (!brand) throw new Error("brand_missing");
  const [conversation] = await store.db
    .insert(conversations)
    .values({
      orgId: org.id,
      brandId: brand.id,
      userId: "customer-1",
      channelType: "messenger",
      channelId: crypto.randomUUID(),
      status: "open",
    })
    .returning();
  if (!conversation) throw new Error("conversation_missing");
  const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:", LLM_PROVIDER: "stub" });
  createApp({
    store,
    fts: null,
    authConfig: toAuthConfig(env),
    env,
    log: createLogger(env),
    startedAt: new Date(),
  });
  return { store, db: store.db, org, brand, conversation, env };
}

async function addPublicMessage(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  senderType: "user" | "agent",
) {
  return insertMessage(fixture.db, {
    orgId: fixture.org.id,
    conversationId: fixture.conversation.id,
    senderType,
    senderId: senderType === "user" ? "customer-1" : "keeni",
    plainText: senderType === "user" ? "I need help" : "This is resolved",
    isInternal: false,
    sentVia: senderType === "user" ? "messenger" : "workflow",
    isAgentReply: senderType === "agent",
  });
}

describe("conversation auto-close lifecycle", () => {
  it("closes a resolved conversation and reopens it on a later customer reply", async () => {
    const fixture = await createFixture();
    const agentMessage = await addPublicMessage(fixture, "agent");
    const [run] = await fixture.db
      .insert(agentRuns)
      .values({
        orgId: fixture.org.id,
        brandId: fixture.brand.id,
        conversationId: fixture.conversation.id,
        trigger: "workflow_let_keeni_answer",
        actorType: "workflow",
        status: "completed",
        phase: "observe",
        inputSnapshot: {},
      })
      .returning();
    if (!run) throw new Error("run_missing");
    const now = new Date();
    const job = await scheduleResolvedConversationAutoClose(fixture.db, {
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      conversationId: fixture.conversation.id,
      agentRunId: run.id,
      resolutionType: "confirmed",
      now,
    });
    expect(job?.basisMessageId).toBe(agentMessage.message.id);

    const result = await runDueConversationAutoCloseJobs(fixture.db, {
      now: new Date(now.getTime() + 8 * 60_000),
    });
    expect(result).toMatchObject({ closed: 1, failed: 0 });
    const [closed] = await fixture.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, fixture.conversation.id));
    expect(closed?.status).toBe("closed");
    expect(closed?.attributes).toMatchObject({
      keenaiAutoClose: { jobId: job?.id, kind: "resolved" },
    });

    await addPublicMessage(fixture, "user");
    const [reopened] = await fixture.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, fixture.conversation.id));
    expect(reopened?.status).toBe("open");
    expect(reopened?.closedAt).toBeNull();
    expect(reopened?.attributes).not.toHaveProperty("keenaiAutoClose");
    await fixture.store.close();
  });

  it("cancels a pending resolved close when the customer replies", async () => {
    const fixture = await createFixture();
    await addPublicMessage(fixture, "agent");
    const [run] = await fixture.db
      .insert(agentRuns)
      .values({
        orgId: fixture.org.id,
        brandId: fixture.brand.id,
        conversationId: fixture.conversation.id,
        trigger: "workflow_let_keeni_answer",
        actorType: "workflow",
        status: "completed",
        phase: "observe",
        inputSnapshot: {},
      })
      .returning();
    if (!run) throw new Error("run_missing");
    const now = new Date();
    const job = await scheduleResolvedConversationAutoClose(fixture.db, {
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      conversationId: fixture.conversation.id,
      agentRunId: run.id,
      resolutionType: "assumed",
      now,
    });
    await addPublicMessage(fixture, "user");

    const [cancelled] = await fixture.db
      .select()
      .from(conversationAutoCloseJobs)
      .where(eq(conversationAutoCloseJobs.id, job?.id ?? "missing"));
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.reason).toBe("customer_replied");
    const result = await runDueConversationAutoCloseJobs(fixture.db, {
      now: new Date(now.getTime() + 8 * 60_000),
    });
    expect(result.closed).toBe(0);
    await fixture.store.close();
  });

  it("applies brand workflow triggers, preserves block overrides, and reconciles changes", async () => {
    const fixture = await createFixture();
    await addPublicMessage(fixture, "agent");
    await fixture.db.insert(agentOtherSettings).values({
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      abandonedWorkflowTriggers: ["first_message"],
      abandonedWorkflowDelayMinutes: 10,
    });
    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [{ id: "reply", type: "collect_customer_reply", prompt: "Anything else?" }],
    };
    const [workflow] = await fixture.db
      .insert(workflows)
      .values({
        orgId: fixture.org.id,
        brandId: fixture.brand.id,
        name: "First message",
        trigger: "first_message",
        definition,
        status: "published",
      })
      .returning();
    if (!workflow) throw new Error("workflow_missing");
    const [run] = await fixture.db
      .insert(workflowRuns)
      .values({
        orgId: fixture.org.id,
        workflowId: workflow.id,
        conversationId: fixture.conversation.id,
        status: "awaiting_input",
        definitionSnapshot: definition,
        steps: [],
      })
      .returning();
    if (!run) throw new Error("workflow_run_missing");
    const now = new Date();
    const job = await scheduleWorkflowAbandonedAutoClose(fixture.db, {
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      conversationId: fixture.conversation.id,
      workflowRunId: run.id,
      workflowBlockId: "reply",
      workflowTrigger: workflow.trigger,
      definition,
      now,
    });
    expect(job?.policySource).toBe("brand");
    expect(job?.dueAt.getTime()).toBe(now.getTime() + 10 * 60_000);
    expect(workflowTriggerMatchesAgentSetting("page_view", ["visitor_visits_page"])).toBe(true);

    const [settings] = await fixture.db
      .update(agentOtherSettings)
      .set({ abandonedWorkflowTriggers: [], abandonedWorkflowDelayMinutes: 30 })
      .where(eq(agentOtherSettings.brandId, fixture.brand.id))
      .returning();
    if (!settings) throw new Error("settings_missing");
    const reconciled = await reconcileAutoCloseJobsForSettings(fixture.db, settings, now);
    expect(reconciled.cancelled).toBe(1);
    const [cancelled] = await fixture.db
      .select()
      .from(conversationAutoCloseJobs)
      .where(eq(conversationAutoCloseJobs.id, job?.id ?? "missing"));
    expect(cancelled?.status).toBe("cancelled");

    const overrideDefinition: WorkflowDefinition = {
      ...definition,
      blocks: [
        {
          id: "reply-override",
          type: "collect_customer_reply",
          prompt: "Anything else?",
          autoCloseMinutes: 3,
        },
      ],
    };
    const override = await scheduleWorkflowAbandonedAutoClose(fixture.db, {
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      conversationId: fixture.conversation.id,
      workflowRunId: run.id,
      workflowBlockId: "reply-override",
      workflowTrigger: workflow.trigger,
      definition: overrideDefinition,
      now,
    });
    expect(override?.policySource).toBe("block");
    expect(override?.dueAt.getTime()).toBe(now.getTime() + 3 * 60_000);
    await fixture.store.close();
  });

  it("schedules the brand policy when a matching workflow suspends for customer input", async () => {
    const fixture = await createFixture();
    await fixture.db.insert(agentOtherSettings).values({
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      abandonedWorkflowTriggers: ["first_message"],
      abandonedWorkflowDelayMinutes: 15,
    });
    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [{ id: "reply", type: "collect_customer_reply", prompt: "Anything else?" }],
    };
    const [workflow] = await fixture.db
      .insert(workflows)
      .values({
        orgId: fixture.org.id,
        brandId: fixture.brand.id,
        name: "Wait for reply",
        trigger: "first_message",
        definition,
        publishedDefinition: definition,
        status: "published",
      })
      .returning();
    if (!workflow) throw new Error("workflow_missing");

    const run = await executeWorkflow(fixture.db, workflow, fixture.conversation.id, fixture.env);
    expect(run?.status).toBe("awaiting_input");
    const [job] = await fixture.db
      .select()
      .from(conversationAutoCloseJobs)
      .where(eq(conversationAutoCloseJobs.workflowRunId, run?.id ?? "missing"));
    expect(job).toMatchObject({
      kind: "workflow_abandoned",
      status: "pending",
      policySource: "brand",
      workflowTrigger: "first_message",
      workflowBlockId: "reply",
    });
    await fixture.store.close();
  });

  it("cancels the previous wait job when a workflow resumes and schedules its next wait", async () => {
    const fixture = await createFixture();
    await fixture.db.insert(agentOtherSettings).values({
      orgId: fixture.org.id,
      brandId: fixture.brand.id,
      abandonedWorkflowTriggers: ["first_message"],
      abandonedWorkflowDelayMinutes: 10,
    });
    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [
        {
          id: "name",
          type: "collect_data",
          prompt: "What is your name?",
          allowFreeText: false,
          fields: [{ key: "name", label: "Name", required: true }],
        },
        {
          id: "email",
          type: "collect_data",
          prompt: "What is your email?",
          allowFreeText: false,
          fields: [{ key: "email", label: "Email", required: true }],
        },
      ],
    };
    const [workflow] = await fixture.db
      .insert(workflows)
      .values({
        orgId: fixture.org.id,
        brandId: fixture.brand.id,
        name: "Two inputs",
        trigger: "first_message",
        definition,
        publishedDefinition: definition,
        status: "published",
      })
      .returning();
    if (!workflow) throw new Error("workflow_missing");

    const run = await executeWorkflow(fixture.db, workflow, fixture.conversation.id, fixture.env);
    if (!run) throw new Error("workflow_run_missing");
    const resumed = await resumeCollectDataWorkflow(
      fixture.db,
      {
        orgId: fixture.org.id,
        workflowRunId: run.id,
        blockId: "name",
        attributes: { name: "Ada" },
      },
      fixture.env,
    );
    expect(resumed).toMatchObject({ resumed: true, status: "awaiting_input" });

    const jobs = await fixture.db
      .select()
      .from(conversationAutoCloseJobs)
      .where(eq(conversationAutoCloseJobs.workflowRunId, run.id));
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.workflowBlockId === "name")).toMatchObject({
      status: "cancelled",
      reason: "workflow_resumed",
    });
    expect(jobs.find((job) => job.workflowBlockId === "email")).toMatchObject({
      status: "pending",
    });
    await fixture.store.close();
  });
});
