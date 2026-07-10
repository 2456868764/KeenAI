import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createApp } from "../src/app.js";
import { toAuthConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");

function outputPath(envName: string, fallback: string) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

async function assertStatus(
  step: string,
  response: Response,
  expected: number,
): Promise<{ step: string; passed: boolean; status: number; detail: string }> {
  const detail = response.status === expected ? "ok" : await response.text();
  return { step, passed: response.status === expected, status: response.status, detail };
}

function renderMarkdown(report: Awaited<ReturnType<typeof buildReport>>) {
  const steps = report.steps
    .map((step) => `| ${step.step} | ${step.passed ? "pass" : "fail"} | ${step.status} |`)
    .join("\n");
  return [
    "# Internal Support Flow Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| conversation_id | ${report.conversationId ?? "n/a"} |`,
    `| reply_message_id | ${report.replyMessageId ?? "n/a"} |`,
    `| final_status | ${report.finalConversationStatus ?? "n/a"} |`,
    `| inbox_count | ${report.inboxCount} |`,
    `| message_count | ${report.messageCount} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Steps",
    "",
    "| Step | Status | HTTP |",
    "|------|--------|------|",
    steps,
    "",
  ].join("\n");
}

async function buildReport() {
  const store = createLibsqlStore({ url: ":memory:" });
  const steps: Array<{ step: string; passed: boolean; status: number; detail: string }> = [];
  let conversationId: string | null = null;
  let replyMessageId: string | null = null;
  let finalConversationStatus: string | null = null;
  let inboxCount = 0;
  let messageCount = 0;

  try {
    await migrate(store.db, { migrationsFolder: MIGRATIONS_PATH });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "support-flow", name: "Support Flow" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await store.db
      .insert(accounts)
      .values({
        email: "owner@support-flow.test",
        name: "Owner",
        passwordHash: await hashPassword("keenai-demo-12"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    const [memberRow] = await store.db
      .insert(members)
      .values({
        orgId: org.id,
        accountId: account.id,
        role: "owner",
        status: "active",
      })
      .returning();
    const member = requireRow(memberRow, "member");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const authConfig = toAuthConfig(env);
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
        email: "owner@support-flow.test",
        password: "keenai-demo-12",
        orgSlug: "support-flow",
      }),
    });
    steps.push(await assertStatus("login", login, 200));
    const loginBody = (await login.json()) as { accessToken?: string };
    const auth = { Authorization: `Bearer ${loginBody.accessToken}` };

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        userId: "customer@support-flow.test",
        channelType: "email",
        channelId: "<support-flow@mail.test>",
        subject: "Billing help",
        initialMessage: { plainText: "I need help with billing." },
      }),
    });
    steps.push(await assertStatus("create_customer_conversation", created, 201));
    const createdBody = (await created.json()) as { conversation?: { id: string } };
    conversationId = createdBody.conversation?.id ?? null;

    const inbox = await app.request("/api/v1/conversations?limit=20", { headers: auth });
    steps.push(await assertStatus("list_inbox", inbox, 200));
    const inboxBody = (await inbox.json()) as { items?: Array<{ id: string }> };
    inboxCount = inboxBody.items?.length ?? 0;
    if (!inboxBody.items?.some((item) => item.id === conversationId)) {
      steps.push({
        step: "inbox_contains_conversation",
        passed: false,
        status: 200,
        detail: "created conversation missing from inbox",
      });
    } else {
      steps.push({ step: "inbox_contains_conversation", passed: true, status: 200, detail: "ok" });
    }

    const reply = await app.request(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ plainText: "Thanks, we can help with billing." }),
    });
    steps.push(await assertStatus("agent_reply", reply, 201));
    const replyBody = (await reply.json()) as { message?: { id: string } };
    replyMessageId = replyBody.message?.id ?? null;

    const assigned = await app.request(`/api/v1/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: member.id }),
    });
    steps.push(await assertStatus("assign_conversation", assigned, 200));

    const closed = await app.request(`/api/v1/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    steps.push(await assertStatus("close_conversation", closed, 200));
    const closedBody = (await closed.json()) as { conversation?: { status: string } };
    finalConversationStatus = closedBody.conversation?.status ?? null;

    const messagesRes = await app.request(`/api/v1/conversations/${conversationId}/messages`, {
      headers: auth,
    });
    steps.push(await assertStatus("list_thread_messages", messagesRes, 200));
    const messagesBody = (await messagesRes.json()) as { items?: unknown[] };
    messageCount = messagesBody.items?.length ?? 0;

    if (finalConversationStatus !== "closed") {
      steps.push({
        step: "final_status_closed",
        passed: false,
        status: 200,
        detail: `final status ${finalConversationStatus ?? "missing"} != closed`,
      });
    } else {
      steps.push({ step: "final_status_closed", passed: true, status: 200, detail: "ok" });
    }

    const failures = steps.filter((step) => !step.passed).map((step) => step.step);
    return {
      generatedAt: new Date().toISOString(),
      evidenceStatus: failures.length === 0 ? "pass" : "fail",
      mode: "fixture",
      conversationId,
      replyMessageId,
      finalConversationStatus,
      inboxCount,
      messageCount,
      steps,
      failures,
    };
  } finally {
    await store.close();
  }
}

const report = await buildReport();
const jsonPath = outputPath("SUPPORT_FLOW_REPORT_JSON_OUT", "support-flow.json");
const markdownPath = outputPath("SUPPORT_FLOW_REPORT_MD", "support-flow.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
