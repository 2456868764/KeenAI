import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "../packages/storage/node_modules/drizzle-orm/libsql/migrator";
import { createLibsqlStore } from "../packages/storage/src/index.ts";
import {
  accounts,
  brands,
  conversations,
  copilotEvents,
  members,
  organizations,
} from "../packages/storage/src/schema/sqlite/index.ts";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");
const FIXTURE =
  process.argv.includes("--fixture") || process.env.COPILOT_ADOPTION_FIXTURE === "true";
const THRESHOLD = Number(process.env.COPILOT_ADOPTION_THRESHOLD ?? 0.3);
const MIN_EVENTS = Number(process.env.COPILOT_ADOPTION_MIN_EVENTS ?? 10);

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function optionalDate(value) {
  return value ? new Date(value) : undefined;
}

function requireRow(row, label) {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

async function seedFixture(db) {
  const [org] = await db
    .insert(organizations)
    .values({ slug: "copilot-adoption", name: "Copilot Adoption" })
    .returning();
  const [brand] = await db
    .insert(brands)
    .values({ orgId: requireRow(org, "org").id, slug: "default", name: "Default" })
    .returning();
  const [account] = await db
    .insert(accounts)
    .values({ email: "agent@copilot.test", name: "Agent" })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      orgId: requireRow(org, "org").id,
      accountId: requireRow(account, "account").id,
      role: "admin",
      status: "active",
    })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({
      orgId: requireRow(org, "org").id,
      brandId: requireRow(brand, "brand").id,
      channelType: "web",
      channelId: "fixture",
      subject: "Copilot adoption fixture",
    })
    .returning();

  const actions = [
    "accept",
    "accept",
    "accept",
    "accept",
    "edit",
    "edit",
    "edit",
    "discard",
    "discard",
    "discard",
  ];
  await db.insert(copilotEvents).values(
    actions.map((action, index) => ({
      orgId: requireRow(org, "org").id,
      memberId: requireRow(member, "member").id,
      conversationId: requireRow(conversation, "conversation").id,
      action,
      draftLength: 100 + index,
      providerId: "stub",
    })),
  );

  return { orgId: requireRow(org, "org").id };
}

async function queryCopilotEvents(client, input) {
  const clauses = [];
  const args = [];
  if (input.orgId) {
    clauses.push("org_id = ?");
    args.push(input.orgId);
  }
  if (input.since) {
    clauses.push("created_at >= ?");
    args.push(input.since.getTime());
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const result = await client.execute({
    sql: `SELECT action, provider_id, created_at FROM copilot_events${where}`,
    args,
  });
  const rows = result.rows;

  const byAction = { accept: 0, edit: 0, discard: 0, other: 0 };
  const byProvider = {};
  let earliest = null;
  let latest = null;

  for (const row of rows) {
    if (row.action === "accept" || row.action === "edit" || row.action === "discard") {
      byAction[row.action] += 1;
    } else {
      byAction.other += 1;
    }
    const provider = row.provider_id ?? "unknown";
    byProvider[provider] = (byProvider[provider] ?? 0) + 1;
    const at = new Date(Number(row.created_at));
    if (!earliest || at < earliest) earliest = at;
    if (!latest || at > latest) latest = at;
  }

  const totalEvents = rows.length;
  const acceptRate = totalEvents > 0 ? byAction.accept / totalEvents : 0;
  const usedRate = totalEvents > 0 ? (byAction.accept + byAction.edit) / totalEvents : 0;
  const failures = [];
  if (totalEvents < MIN_EVENTS) failures.push(`total_events ${totalEvents} < ${MIN_EVENTS}`);
  if (acceptRate < THRESHOLD) failures.push(`accept_rate ${acceptRate.toFixed(3)} < ${THRESHOLD}`);

  let evidenceStatus = "pass";
  if (totalEvents < MIN_EVENTS) evidenceStatus = "insufficient";
  else if (failures.length > 0) evidenceStatus = "fail";

  return {
    generatedAt: new Date().toISOString(),
    evidenceStatus,
    mode: FIXTURE ? "fixture" : "actual",
    orgId: input.orgId ?? null,
    window: {
      since: input.since?.toISOString?.() ?? null,
      earliest: earliest?.toISOString?.() ?? null,
      latest: latest?.toISOString?.() ?? null,
    },
    thresholds: { acceptRateMin: THRESHOLD, minEvents: MIN_EVENTS },
    totalEvents,
    acceptRate,
    usedRate,
    byAction,
    byProvider,
    failures: evidenceStatus === "pass" ? [] : failures,
  };
}

function renderMarkdown(report) {
  return [
    "# Copilot Adoption Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| org_id | ${report.orgId ?? "n/a"} |`,
    `| total_events | ${report.totalEvents} |`,
    `| accept_rate | ${pct(report.acceptRate)} |`,
    `| used_rate_accept_or_edit | ${pct(report.usedRate)} |`,
    `| threshold | ${pct(report.thresholds.acceptRateMin)} |`,
    `| min_events | ${report.thresholds.minEvents} |`,
    `| accept | ${report.byAction.accept} |`,
    `| edit | ${report.byAction.edit} |`,
    `| discard | ${report.byAction.discard} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
  ].join("\n");
}

async function main() {
  const databaseUrl = FIXTURE ? ":memory:" : process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required unless --fixture is set");

  const store = createLibsqlStore({
    url: databaseUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    let orgId = process.env.COPILOT_ADOPTION_ORG_ID;
    if (FIXTURE || process.env.COPILOT_ADOPTION_MIGRATE === "true") {
      await migrate(store.db, { migrationsFolder: MIGRATIONS_PATH });
    }
    if (FIXTURE) {
      const seeded = await seedFixture(store.db);
      orgId = seeded.orgId;
    }

    const report = await queryCopilotEvents(store.client, {
      orgId,
      since: optionalDate(process.env.COPILOT_ADOPTION_SINCE),
    });
    const jsonPath = outputPath("COPILOT_ADOPTION_REPORT_JSON_OUT", "copilot-adoption.json");
    const markdownPath = outputPath("COPILOT_ADOPTION_REPORT_MD", "copilot-adoption.md");
    writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeOutput(markdownPath, renderMarkdown(report));
    console.log(`wrote ${jsonPath}`);
    console.log(`wrote ${markdownPath}`);

    if (report.evidenceStatus === "fail") {
      process.exitCode = 1;
    }
  } finally {
    await store.close();
  }
}

await main();
