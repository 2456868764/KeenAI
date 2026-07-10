import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectResolution } from "../packages/agent/src/index.ts";
import { migrate } from "../packages/storage/node_modules/drizzle-orm/libsql/migrator";
import { createLibsqlStore } from "../packages/storage/src/index.ts";
import {
  accounts,
  brands,
  conversations,
  members,
  messages,
  organizations,
} from "../packages/storage/src/schema/sqlite/index.ts";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const MIGRATIONS_PATH = join(ROOT, "packages/storage/migrations/libsql");
const FIXTURE =
  process.argv.includes("--fixture") || process.env.AUTO_RESOLUTION_FIXTURE === "true";
const THRESHOLD = Number(process.env.AUTO_RESOLUTION_THRESHOLD ?? 0.5);
const MIN_CONVERSATIONS = Number(process.env.AUTO_RESOLUTION_MIN_CONVERSATIONS ?? 10);

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function requireRow(row, label) {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

function optionalDate(value) {
  return value ? new Date(value) : undefined;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function messageContent(plainText) {
  return { type: "doc", content: [{ type: "paragraph", text: plainText }] };
}

async function insertFixtureConversation(db, input) {
  const [conversation] = await db
    .insert(conversations)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      userId: input.customerId,
      channelType: "web",
      channelId: `auto-resolution-${input.index}`,
      subject: input.subject,
      status: "closed",
      closedAt: input.closedAt,
      lastMessageAt: input.closedAt,
      messageCount: input.messages.length,
      rating: input.rating,
    })
    .returning();
  const row = requireRow(conversation, "conversation");

  await db.insert(messages).values(
    input.messages.map((message, index) => ({
      orgId: input.orgId,
      conversationId: row.id,
      senderType: message.senderType,
      senderId: message.senderType === "user" ? input.customerId : input.memberId,
      plainText: message.plainText,
      content: messageContent(message.plainText),
      isInternal: false,
      sentVia: message.senderType === "user" ? "web" : "agent",
      deliveryStatus: "sent",
      metadata: { messageKind: "text" },
      createdAt: new Date(input.closedAt.getTime() - (input.messages.length - index) * 1000),
    })),
  );
}

async function seedFixture(db) {
  const [org] = await db
    .insert(organizations)
    .values({ slug: "auto-resolution", name: "Auto Resolution" })
    .returning();
  const [brand] = await db
    .insert(brands)
    .values({ orgId: requireRow(org, "org").id, slug: "default", name: "Default" })
    .returning();
  const [account] = await db
    .insert(accounts)
    .values({ email: "agent@auto-resolution.test", name: "Agent" })
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

  const orgId = requireRow(org, "org").id;
  const brandId = requireRow(brand, "brand").id;
  const memberId = requireRow(member, "member").id;
  const now = new Date();
  const samples = [
    {
      subject: "Assumed resolved 1",
      rating: 5,
      messages: [
        { senderType: "user", plainText: "How do I export invoices?" },
        { senderType: "agent", plainText: "Your issue is resolved and should be all set now." },
      ],
    },
    {
      subject: "Confirmed resolved 1",
      rating: 5,
      messages: [
        { senderType: "user", plainText: "I cannot find the refund setting." },
        { senderType: "agent", plainText: "Open Billing, choose Refunds, then Save." },
        { senderType: "user", plainText: "Thanks, that fixed it!" },
      ],
    },
    {
      subject: "Assumed resolved 2",
      rating: 4,
      messages: [
        { senderType: "user", plainText: "My login link expired." },
        { senderType: "agent", plainText: "This should be all set now." },
      ],
    },
    {
      subject: "Confirmed resolved 2",
      rating: 5,
      messages: [
        { senderType: "user", plainText: "Where is CSV export?" },
        { senderType: "agent", plainText: "Go to Data Management and click Export." },
        { senderType: "user", plainText: "Perfect, thank you." },
      ],
    },
    {
      subject: "Assumed resolved 3",
      rating: 4,
      messages: [
        { senderType: "user", plainText: "Need help changing plan." },
        { senderType: "agent", plainText: "The billing change is taken care of." },
      ],
    },
    {
      subject: "Assumed resolved 4",
      rating: 5,
      messages: [
        { senderType: "user", plainText: "Can you update my workspace name?" },
        { senderType: "agent", plainText: "Issue is resolved and the new name is active." },
      ],
    },
    {
      subject: "Unresolved 1",
      rating: 2,
      messages: [
        { senderType: "user", plainText: "The webhook is failing." },
        { senderType: "agent", plainText: "Can you send more logs?" },
      ],
    },
    {
      subject: "Escalated",
      rating: 3,
      messages: [
        { senderType: "user", plainText: "I need a refund exception." },
        { senderType: "agent", plainText: "I will transfer you to a human agent now." },
      ],
    },
    {
      subject: "Unresolved 2",
      rating: 1,
      messages: [
        { senderType: "user", plainText: "The report is wrong." },
        { senderType: "agent", plainText: "Please share a screenshot." },
      ],
    },
    {
      subject: "Unresolved 3",
      rating: 2,
      messages: [
        { senderType: "user", plainText: "Email delivery is delayed." },
        { senderType: "agent", plainText: "We are checking the queue." },
      ],
    },
  ];

  await Promise.all(
    samples.map((sample, index) =>
      insertFixtureConversation(db, {
        ...sample,
        orgId,
        brandId,
        memberId,
        customerId: `customer-${index}@auto-resolution.test`,
        index,
        closedAt: new Date(now.getTime() - index * 60_000),
      }),
    ),
  );

  return { orgId };
}

async function queryRows(client, input) {
  const clauses = ["c.status = 'closed'"];
  const args = [];
  if (input.orgId) {
    clauses.push("c.org_id = ?");
    args.push(input.orgId);
  }
  if (input.since) {
    clauses.push("c.closed_at >= ?");
    args.push(input.since.getTime());
  }

  const result = await client.execute({
    sql: `
      SELECT
        c.id AS conversation_id,
        c.org_id,
        c.brand_id,
        c.subject,
        c.closed_at,
        c.rating,
        m.id AS message_id,
        m.sender_type,
        m.plain_text,
        m.is_internal,
        m.created_at
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY c.closed_at DESC, c.id ASC, m.created_at ASC
    `,
    args,
  });

  return result.rows;
}

function buildConversationSummaries(rows) {
  const byConversation = new Map();
  for (const row of rows) {
    const id = String(row.conversation_id);
    if (!byConversation.has(id)) {
      byConversation.set(id, {
        id,
        orgId: row.org_id,
        brandId: row.brand_id,
        subject: row.subject,
        closedAt: row.closed_at ? new Date(Number(row.closed_at)).toISOString() : null,
        rating: row.rating ?? null,
        messages: [],
      });
    }
    if (row.message_id) {
      byConversation.get(id).messages.push({
        id: row.message_id,
        senderType: row.sender_type,
        plainText: row.plain_text ?? "",
        isInternal: Boolean(row.is_internal),
        createdAt: Number(row.created_at ?? 0),
      });
    }
  }

  return [...byConversation.values()].map((conversation) => {
    const external = conversation.messages.filter((message) => !message.isInternal);
    const agentMessages = external.filter(
      (message) => message.senderType === "agent" || message.senderType === "ai",
    );
    const lastAgent = agentMessages.at(-1);
    const customerAfterAgent = lastAgent
      ? external
          .filter(
            (message) => message.senderType === "user" && message.createdAt > lastAgent.createdAt,
          )
          .at(-1)
      : null;
    const resolution = lastAgent
      ? detectResolution({
          replyText: lastAgent.plainText,
          customerMessage: customerAfterAgent?.plainText,
        })
      : {
          type: "unresolved",
          confidence: 0.5,
          evidence: "No external agent message",
        };
    const automatedResolved = resolution.type === "confirmed" || resolution.type === "assumed";

    return {
      id: conversation.id,
      subject: conversation.subject,
      closedAt: conversation.closedAt,
      rating: conversation.rating,
      messageCount: external.length,
      lastAgentReply: lastAgent?.plainText ?? null,
      customerConfirmation: customerAfterAgent?.plainText ?? null,
      resolution,
      automatedResolved,
    };
  });
}

async function buildReport(client, input) {
  const rows = await queryRows(client, input);
  const conversations = buildConversationSummaries(rows);
  const totalClosedConversations = conversations.length;
  const automatedResolved = conversations.filter((conversation) => conversation.automatedResolved);
  const escalated = conversations.filter(
    (conversation) => conversation.resolution.type === "escalated",
  );
  const unresolved = conversations.filter(
    (conversation) => conversation.resolution.type === "unresolved",
  );
  const autoResolutionRate =
    totalClosedConversations > 0 ? automatedResolved.length / totalClosedConversations : 0;
  const failures = [];
  if (totalClosedConversations < MIN_CONVERSATIONS) {
    failures.push(`closed_conversations ${totalClosedConversations} < ${MIN_CONVERSATIONS}`);
  }
  if (autoResolutionRate < THRESHOLD) {
    failures.push(`auto_resolution_rate ${autoResolutionRate.toFixed(3)} < ${THRESHOLD}`);
  }

  let evidenceStatus = "pass";
  if (totalClosedConversations < MIN_CONVERSATIONS) evidenceStatus = "insufficient";
  else if (failures.length > 0) evidenceStatus = "fail";

  return {
    generatedAt: new Date().toISOString(),
    evidenceStatus,
    mode: FIXTURE ? "fixture" : "actual",
    orgId: input.orgId ?? null,
    window: { since: input.since?.toISOString?.() ?? null },
    thresholds: {
      autoResolutionRateMin: THRESHOLD,
      minClosedConversations: MIN_CONVERSATIONS,
    },
    totalClosedConversations,
    automatedResolvedConversations: automatedResolved.length,
    autoResolutionRate,
    byResolution: {
      confirmed: conversations.filter(
        (conversation) => conversation.resolution.type === "confirmed",
      ).length,
      assumed: conversations.filter((conversation) => conversation.resolution.type === "assumed")
        .length,
      unresolved: unresolved.length,
      escalated: escalated.length,
    },
    failures: evidenceStatus === "pass" ? [] : failures,
    samples: conversations.slice(0, 10).map((conversation) => ({
      id: conversation.id,
      subject: conversation.subject,
      automatedResolved: conversation.automatedResolved,
      resolution: conversation.resolution,
      customerConfirmation: conversation.customerConfirmation,
    })),
  };
}

function renderMarkdown(report) {
  const sampleRows = report.samples
    .map(
      (sample) =>
        `| ${sample.id} | ${sample.automatedResolved ? "yes" : "no"} | ${sample.resolution.type} | ${sample.resolution.evidence} |`,
    )
    .join("\n");

  return [
    "# Auto Resolution Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| org_id | ${report.orgId ?? "n/a"} |`,
    `| total_closed_conversations | ${report.totalClosedConversations} |`,
    `| automated_resolved_conversations | ${report.automatedResolvedConversations} |`,
    `| auto_resolution_rate | ${pct(report.autoResolutionRate)} |`,
    `| threshold | ${pct(report.thresholds.autoResolutionRateMin)} |`,
    `| min_closed_conversations | ${report.thresholds.minClosedConversations} |`,
    `| confirmed | ${report.byResolution.confirmed} |`,
    `| assumed | ${report.byResolution.assumed} |`,
    `| unresolved | ${report.byResolution.unresolved} |`,
    `| escalated | ${report.byResolution.escalated} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Samples",
    "",
    "| Conversation | Auto resolved | Resolution | Evidence |",
    "|--------------|---------------|------------|----------|",
    sampleRows,
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
    let orgId = process.env.AUTO_RESOLUTION_ORG_ID;
    if (FIXTURE || process.env.AUTO_RESOLUTION_MIGRATE === "true") {
      await migrate(store.db, { migrationsFolder: MIGRATIONS_PATH });
    }
    if (FIXTURE) {
      const seeded = await seedFixture(store.db);
      orgId = seeded.orgId;
    }

    const report = await buildReport(store.client, {
      orgId,
      since: optionalDate(process.env.AUTO_RESOLUTION_SINCE),
    });
    const jsonPath = outputPath("AUTO_RESOLUTION_REPORT_JSON_OUT", "auto-resolution.json");
    const markdownPath = outputPath("AUTO_RESOLUTION_REPORT_MD", "auto-resolution.md");
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
