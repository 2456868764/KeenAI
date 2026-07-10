import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWidgetUserHash, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createApp } from "../src/app.js";
import { toAuthConfig } from "../src/config.js";
import { widgetHmacSecret } from "../src/lib/widget.js";
import { createLogger } from "../src/logger.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");

type StepResult = {
  step: string;
  passed: boolean;
  status: number;
  detail: string;
};

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
): Promise<StepResult> {
  const detail = response.status === expected ? "ok" : await response.text();
  return { step, passed: response.status === expected, status: response.status, detail };
}

function passStep(step: string, passed: boolean, detail: string): StepResult {
  return { step, passed, status: 200, detail };
}

function renderMarkdown(report: Awaited<ReturnType<typeof buildReport>>) {
  const steps = report.steps
    .map((step) => `| ${step.step} | ${step.passed ? "pass" : "fail"} | ${step.status} |`)
    .join("\n");

  return [
    "# Customer Reachability Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| widget_conversation_id | ${report.widget.conversationId ?? "n/a"} |`,
    `| widget_message_count | ${report.widget.messageCount} |`,
    `| email_conversation_id | ${report.email.conversationId ?? "n/a"} |`,
    `| email_message_count | ${report.email.messageCount} |`,
    `| email_thread_match | ${report.email.threadMatchReason ?? "n/a"} |`,
    `| inbox_count | ${report.inbox.count} |`,
    `| widget_visible_in_inbox | ${report.inbox.widgetVisible ? "yes" : "no"} |`,
    `| email_visible_in_inbox | ${report.inbox.emailVisible ? "yes" : "no"} |`,
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
  const steps: StepResult[] = [];
  let widgetConversationId: string | null = null;
  let widgetMessageCount = 0;
  let emailConversationId: string | null = null;
  let emailMessageCount = 0;
  let emailThreadMatchReason: string | null = null;
  let inboxCount = 0;
  let widgetVisible = false;
  let emailVisible = false;

  try {
    await migrate(store.db, { migrationsFolder: MIGRATIONS_PATH });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "customer-reachability", name: "Customer Reachability" })
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
        email: "owner@customer-reachability.test",
        name: "Owner",
        passwordHash: await hashPassword("keenai-demo-12"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await store.db
      .insert(members)
      .values({
        orgId: org.id,
        accountId: account.id,
        role: "owner",
        status: "active",
      })
      .returning();

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
        email: "owner@customer-reachability.test",
        password: "keenai-demo-12",
        orgSlug: "customer-reachability",
      }),
    });
    steps.push(await assertStatus("agent_login", login, 200));
    const loginBody = (await login.json()) as { accessToken?: string };
    const agentAuth = { Authorization: `Bearer ${loginBody.accessToken}` };

    const widgetUserId = "visitor-reachability-1";
    const userHash = createWidgetUserHash(widgetHmacSecret(env), widgetUserId);
    const widgetSession = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "customer-reachability",
        brandSlug: "default",
        user: {
          id: widgetUserId,
          userHash,
          email: "visitor@customer-reachability.test",
          name: "Visitor",
        },
      }),
    });
    steps.push(await assertStatus("widget_hmac_session", widgetSession, 200));
    const widgetSessionBody = (await widgetSession.json()) as { accessToken?: string };
    const widgetAuth = { Authorization: `Bearer ${widgetSessionBody.accessToken}` };

    const widgetConversation = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...widgetAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "Widget reachability",
        initialMessage: { plainText: "I need support from the widget." },
      }),
    });
    steps.push(await assertStatus("widget_create_conversation", widgetConversation, 201));
    const widgetConversationBody = (await widgetConversation.json()) as {
      conversation?: { id: string };
      created?: boolean;
    };
    widgetConversationId = widgetConversationBody.conversation?.id ?? null;

    const widgetFollowUp = await app.request(
      `/api/v1/widget/conversations/${widgetConversationId}/messages`,
      {
        method: "POST",
        headers: { ...widgetAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ plainText: "Widget follow-up message." }),
      },
    );
    steps.push(await assertStatus("widget_post_message", widgetFollowUp, 201));

    const widgetMessages = await app.request(
      `/api/v1/widget/conversations/${widgetConversationId}/messages`,
      { headers: widgetAuth },
    );
    steps.push(await assertStatus("widget_list_messages", widgetMessages, 200));
    const widgetMessagesBody = (await widgetMessages.json()) as { items?: unknown[] };
    widgetMessageCount = widgetMessagesBody.items?.length ?? 0;
    steps.push(
      passStep(
        "widget_message_count_at_least_two",
        widgetMessageCount >= 2,
        `${widgetMessageCount} widget messages`,
      ),
    );

    const firstEmail = await app.request(
      "/api/v1/webhooks/email/inbound?org=customer-reachability&brand=default",
      {
        method: "POST",
        body: `From: Email Customer <email-customer@example.com>
To: support@keenai.local
Subject: Email reachability
Message-ID: <reachability-1@example.com>
Content-Type: text/plain

I need support by email.
`,
      },
    );
    steps.push(await assertStatus("email_webhook_first_message", firstEmail, 202));
    const firstEmailBody = (await firstEmail.json()) as {
      created?: boolean;
      conversation?: { id: string };
      messageId?: string;
    };
    emailConversationId = firstEmailBody.conversation?.id ?? null;
    steps.push(
      passStep(
        "email_first_message_creates_conversation",
        firstEmailBody.created === true,
        `created=${String(firstEmailBody.created)}`,
      ),
    );

    const secondEmail = await app.request(
      "/api/v1/webhooks/email/inbound?org=customer-reachability&brand=default",
      {
        method: "POST",
        body: `From: Email Customer <email-customer@example.com>
To: support@keenai.local
Subject: Re: Email reachability
Message-ID: <reachability-2@example.com>
In-Reply-To: <reachability-1@example.com>
References: <reachability-1@example.com>
Content-Type: text/plain

This is the threaded follow-up.
`,
      },
    );
    steps.push(await assertStatus("email_webhook_threaded_reply", secondEmail, 202));
    const secondEmailBody = (await secondEmail.json()) as {
      created?: boolean;
      conversation?: { id: string };
      thread?: { matchReason?: string };
    };
    emailThreadMatchReason = secondEmailBody.thread?.matchReason ?? null;
    steps.push(
      passStep(
        "email_reply_threads_existing_conversation",
        secondEmailBody.created === false &&
          secondEmailBody.conversation?.id === emailConversationId &&
          emailThreadMatchReason === "in-reply-to",
        `created=${String(secondEmailBody.created)}, match=${emailThreadMatchReason ?? "missing"}`,
      ),
    );

    const emailMessages = await app.request(
      `/api/v1/conversations/${emailConversationId}/messages`,
      {
        headers: agentAuth,
      },
    );
    steps.push(await assertStatus("email_list_thread_messages", emailMessages, 200));
    const emailMessagesBody = (await emailMessages.json()) as { items?: unknown[] };
    emailMessageCount = emailMessagesBody.items?.length ?? 0;
    steps.push(
      passStep(
        "email_message_count_at_least_two",
        emailMessageCount >= 2,
        `${emailMessageCount} email messages`,
      ),
    );

    const inbox = await app.request("/api/v1/conversations?limit=50", { headers: agentAuth });
    steps.push(await assertStatus("agent_inbox_lists_customer_channels", inbox, 200));
    const inboxBody = (await inbox.json()) as { items?: Array<{ id: string }> };
    inboxCount = inboxBody.items?.length ?? 0;
    widgetVisible = inboxBody.items?.some((item) => item.id === widgetConversationId) ?? false;
    emailVisible = inboxBody.items?.some((item) => item.id === emailConversationId) ?? false;
    steps.push(passStep("widget_visible_in_agent_inbox", widgetVisible, String(widgetVisible)));
    steps.push(passStep("email_visible_in_agent_inbox", emailVisible, String(emailVisible)));

    const failures = steps.filter((step) => !step.passed).map((step) => step.step);
    return {
      generatedAt: new Date().toISOString(),
      evidenceStatus: failures.length === 0 ? "pass" : "fail",
      mode: "fixture",
      widget: {
        conversationId: widgetConversationId,
        messageCount: widgetMessageCount,
      },
      email: {
        conversationId: emailConversationId,
        messageCount: emailMessageCount,
        threadMatchReason: emailThreadMatchReason,
      },
      inbox: {
        count: inboxCount,
        widgetVisible,
        emailVisible,
      },
      steps,
      failures,
    };
  } finally {
    await store.close();
  }
}

const report = await buildReport();
const jsonPath = outputPath("CUSTOMER_REACHABILITY_REPORT_JSON_OUT", "customer-reachability.json");
const markdownPath = outputPath("CUSTOMER_REACHABILITY_REPORT_MD", "customer-reachability.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
