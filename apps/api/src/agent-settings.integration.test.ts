import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  agentRuns,
  brands,
  conversationAutoCloseJobs,
  conversations,
  members,
  messages,
  organizations,
  workflowRuns,
  workflows,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { insertMessage } from "./lib/conversations.js";
import { executeWorkflow } from "./lib/workflow-engine.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

describe("agent other settings integration", () => {
  it("creates defaults and persists brand-scoped settings", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "agent-settings", name: "Agent Settings" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [otherBrandRow] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "restricted", name: "Restricted" })
      .returning();
    const otherBrand = requireRow(otherBrandRow, "otherBrand");
    const [accountRow] = await store.db
      .insert(accounts)
      .values({
        email: "settings@acme.test",
        name: "Settings Admin",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await store.db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      LLM_PROVIDER: "stub",
    });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const login = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "settings@acme.test",
        password: "password12345",
        orgSlug: "agent-settings",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const [conversationRow] = await store.db
      .insert(conversations)
      .values({
        orgId: org.id,
        brandId: brand.id,
        userId: "settings-customer",
        channelType: "messenger",
        channelId: crypto.randomUUID(),
        status: "open",
      })
      .returning();
    const conversation = requireRow(conversationRow, "conversation");
    const jobCreatedAt = new Date("2026-09-17T12:00:00.000Z");
    const [jobRow] = await store.db
      .insert(conversationAutoCloseJobs)
      .values({
        orgId: org.id,
        brandId: brand.id,
        conversationId: conversation.id,
        kind: "resolved",
        policySource: "brand",
        dedupeKey: `settings-reconcile:${conversation.id}`,
        dueAt: new Date(jobCreatedAt.getTime() + 7 * 60_000),
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt,
      })
      .returning();
    const job = requireRow(jobRow, "job");

    const defaultsResponse = await app.request(`/api/v1/agent-settings/${brand.id}`, {
      headers: auth,
    });
    expect(defaultsResponse.status).toBe(200);
    const defaults = (await defaultsResponse.json()) as {
      settings: {
        simpleDeployEnabled: boolean;
        allowHandoff: boolean;
        autoCloseResolvedDelayMinutes: number;
        abandonedWorkflowTriggers: string[];
      };
    };
    expect(defaults.settings).toMatchObject({
      simpleDeployEnabled: false,
      allowHandoff: true,
      autoCloseResolvedDelayMinutes: 7,
      abandonedWorkflowTriggers: [],
    });

    const updateResponse = await app.request(`/api/v1/agent-settings/${brand.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        simpleDeployEnabled: true,
        allowHandoff: false,
        autoCloseResolvedDelayMinutes: 1_570,
        abandonedWorkflowTriggers: ["first_message", "any_message"],
        abandonedWorkflowDelayMinutes: 30,
      }),
    });
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      settings: {
        simpleDeployEnabled: boolean;
        allowHandoff: boolean;
        autoCloseResolvedDelayMinutes: number;
        abandonedWorkflowTriggers: string[];
        abandonedWorkflowDelayMinutes: number;
      };
    };
    expect(updated.settings).toMatchObject({
      simpleDeployEnabled: true,
      allowHandoff: false,
      autoCloseResolvedDelayMinutes: 1_570,
      abandonedWorkflowTriggers: ["first_message", "any_message"],
      abandonedWorkflowDelayMinutes: 30,
    });

    const agentDefinition = {
      trigger: "first_message" as const,
      blocks: [{ id: "answer", type: "let_keeni_answer" as const, maxSteps: 1 }],
    };
    const [workflowRow] = await store.db
      .insert(workflows)
      .values({
        orgId: org.id,
        brandId: brand.id,
        name: "Agent deployment guard",
        trigger: agentDefinition.trigger,
        definition: agentDefinition,
        publishedDefinition: agentDefinition,
        status: "published",
      })
      .returning();
    const workflow = requireRow(workflowRow, "workflow");
    const blockedRun = await executeWorkflow(store.db, workflow, conversation.id, env, authConfig);
    expect(blockedRun).toBeNull();
    const storedRuns = await store.db.select().from(workflowRuns);
    expect(storedRuns).toHaveLength(0);

    const [rescheduledJob] = await store.db
      .select()
      .from(conversationAutoCloseJobs)
      .where(eq(conversationAutoCloseJobs.id, job.id));
    expect(rescheduledJob?.status).toBe("pending");
    expect(rescheduledJob?.dueAt.getTime()).toBe(jobCreatedAt.getTime() + 1_570 * 60_000);

    const disableResponse = await app.request(`/api/v1/agent-settings/${brand.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ autoCloseResolvedEnabled: false }),
    });
    expect(disableResponse.status).toBe(200);
    const [cancelledJob] = await store.db
      .select()
      .from(conversationAutoCloseJobs)
      .where(eq(conversationAutoCloseJobs.id, job.id));
    expect(cancelledJob?.status).toBe("cancelled");
    expect(cancelledJob?.reason).toBe("settings_disabled");

    const automationDefinition = {
      trigger: "any_message" as const,
      blocks: [
        {
          id: "tag",
          type: "tag_conversation" as const,
          tags: ["basic-agent-active"],
          mode: "append" as const,
        },
      ],
    };
    await store.db.insert(workflows).values({
      orgId: org.id,
      brandId: brand.id,
      name: "Message tagging automation",
      trigger: automationDefinition.trigger,
      definition: automationDefinition,
      publishedDefinition: automationDefinition,
      status: "published",
    });

    await insertMessage(store.db, {
      orgId: org.id,
      conversationId: conversation.id,
      senderType: "user",
      senderId: "settings-customer",
      plainText: "How do I update my billing details?",
      isInternal: false,
      sentVia: "api",
      isAgentReply: false,
    });

    const runsAfterMessage = await store.db.select().from(workflowRuns);
    expect(runsAfterMessage).toHaveLength(1);
    const basicRuns = await store.db.select().from(agentRuns);
    expect(basicRuns).toHaveLength(1);
    expect(basicRuns[0]).toMatchObject({
      trigger: "basic_agent",
      actorType: "system",
      conversationId: conversation.id,
    });
    const storedMessages = await store.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    expect(storedMessages.some((message) => message.senderType === "agent")).toBe(true);
    const [taggedConversation] = await store.db
      .select({ tags: conversations.tags })
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(taggedConversation?.tags).toContain("basic-agent-active");

    const invalidResponse = await app.request(`/api/v1/agent-settings/${otherBrand.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ abandonedWorkflowTriggers: ["unknown"] }),
    });
    expect(invalidResponse.status).toBe(400);

    await store.close();
  });
});
