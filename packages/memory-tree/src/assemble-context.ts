import type { KeenaiDb } from "@keenai/storage";
import { memorySummaries } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import { buildMemoryL3Section, queryMemoryFacts } from "./query-facts.js";
import {
  queryBrandDailyDigest,
  queryConversationMemoryTree,
  queryCustomerMemoryTree,
} from "./query.js";
import { conversationScopeKey, customerScopeKey } from "./scope-key.js";
import {
  type MemoryScope,
  resolveDigestDateFromInstruction,
  resolveMemoryScope,
} from "./scope-router.js";
import { defaultDigestDateUtc, formatUtcDate } from "./utc-date.js";

const MAX_CONTEXT_CHARS = 4_000;

export type MemoryContextSection = {
  title: string;
  body: string;
};

export type AssembleMemoryContextInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  userId?: string | null;
  instruction?: string;
  dateUtc?: string;
};

export type AssembleMemoryContextResult = {
  scope: MemoryScope;
  applied: boolean;
  sections: MemoryContextSection[];
  text: string;
  signals: string[];
};

function truncate(text: string, max = MAX_CONTEXT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

function formatSections(scope: MemoryScope, sections: MemoryContextSection[]): string {
  if (sections.length === 0) return "";
  const lines = [`[Memory Tree · scope=${scope}]`];
  for (const section of sections) {
    lines.push(`## ${section.title}`, section.body);
  }
  return truncate(lines.join("\n\n"));
}

async function loadLatestConversationSummary(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; conversationId: string },
): Promise<MemoryContextSection | null> {
  const scopeKey = conversationScopeKey(input.conversationId);
  const [summary] = await db
    .select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
        eq(memorySummaries.scopeKey, scopeKey),
        eq(memorySummaries.level, 1),
      ),
    )
    .orderBy(desc(memorySummaries.sealedAt))
    .limit(1);

  if (!summary) return null;

  return {
    title: summary.title ?? "Conversation summary (L1)",
    body: summary.summary,
  };
}

async function loadConversationSections(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; conversationId: string },
): Promise<MemoryContextSection[]> {
  const sections: MemoryContextSection[] = [];

  const tree = await queryConversationMemoryTree(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
    mode: "latest",
    level: 0,
  });

  const leaves = tree.levels.flatMap((level) => level.nodes.filter((node) => node.kind === "leaf"));

  if (leaves.length > 0) {
    sections.push({
      title: "Current conversation buffer (L0)",
      body: leaves.map((leaf) => `- ${leaf.body}`).join("\n"),
    });
  }

  const summary = await loadLatestConversationSummary(db, input);
  if (summary) sections.push(summary);

  return sections;
}

async function loadBrandDailySection(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; dateUtc: string },
): Promise<MemoryContextSection | null> {
  const digest = await queryBrandDailyDigest(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    dateUtc: input.dateUtc,
  });

  if (!digest) return null;

  const events =
    digest.keyEvents.length > 0
      ? `\n\nKey events:\n${digest.keyEvents.map((e) => `- ${e}`).join("\n")}`
      : "";

  return {
    title: `Brand daily digest (${input.dateUtc})`,
    body: `${digest.summary}${events}`,
  };
}

async function loadCustomerSections(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; userId: string },
): Promise<MemoryContextSection[]> {
  const sections: MemoryContextSection[] = [];

  const tree = await queryCustomerMemoryTree(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    userId: input.userId,
    mode: "latest",
    level: 0,
  });

  const leaves = tree.levels.flatMap((level) => level.nodes.filter((node) => node.kind === "leaf"));
  if (leaves.length > 0) {
    sections.push({
      title: "Customer topic buffer (L0)",
      body: leaves.map((leaf) => `- ${leaf.body}`).join("\n"),
    });
  }

  const scopeKey = customerScopeKey(input.userId);
  const [summary] = await db
    .select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.orgId, input.orgId),
        eq(memorySummaries.brandId, input.brandId),
        eq(memorySummaries.scopeKey, scopeKey),
        eq(memorySummaries.level, 1),
      ),
    )
    .orderBy(desc(memorySummaries.sealedAt))
    .limit(1);

  if (summary) {
    sections.push({
      title: summary.title ?? "Customer summary (L1)",
      body: summary.summary,
    });
  }

  return sections;
}

async function loadL3Section(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; scope: string; scopeId: string },
): Promise<MemoryContextSection | null> {
  const l3 = await queryMemoryFacts(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    scope: input.scope,
    scopeId: input.scopeId,
  });
  return buildMemoryL3Section(l3);
}

/** Assemble Memory Tree context blocks for Agent / Copilot prompts. */
export async function assembleMemoryContext(
  db: KeenaiDb,
  input: AssembleMemoryContextInput,
): Promise<AssembleMemoryContextResult> {
  const { scope, signals } = resolveMemoryScope({ instruction: input.instruction });

  if (scope === "kb_only") {
    return { scope, applied: false, sections: [], text: "", signals };
  }

  const sections: MemoryContextSection[] = [];
  const base = {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
  };

  if (scope === "conversation" || scope === "hybrid") {
    sections.push(...(await loadConversationSections(db, base)));
    const l3 = await loadL3Section(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      scope: "conversation",
      scopeId: input.conversationId,
    });
    if (l3) sections.push(l3);
  }

  if (scope === "brand_daily" || scope === "hybrid") {
    const dateUtc =
      resolveDigestDateFromInstruction(input.instruction, input.dateUtc) ??
      formatUtcDate(new Date());
    const daily = await loadBrandDailySection(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      dateUtc,
    });
    if (daily) sections.push(daily);
  }

  if (scope === "customer") {
    if (input.userId) {
      sections.push(
        ...(await loadCustomerSections(db, {
          orgId: input.orgId,
          brandId: input.brandId,
          userId: input.userId,
        })),
      );
      const l3 = await loadL3Section(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        scope: "customer",
        scopeId: input.userId,
      });
      if (l3) sections.push(l3);
    } else {
      sections.push({
        title: "Customer memory",
        body: "Customer scope requested but conversation has no linked userId.",
      });
    }
  }

  if (scope === "hybrid" && input.userId) {
    const customerL3 = await loadL3Section(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      scope: "customer",
      scopeId: input.userId,
    });
    if (customerL3) sections.push(customerL3);
  }

  if (scope === "brand_daily" && sections.length === 0) {
    const fallbackDate =
      resolveDigestDateFromInstruction(input.instruction, input.dateUtc) ?? defaultDigestDateUtc();
    const fallback = await loadBrandDailySection(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      dateUtc: fallbackDate,
    });
    if (fallback) sections.push(fallback);
  }

  const text = formatSections(scope, sections);
  return {
    scope,
    applied: sections.length > 0,
    sections,
    text,
    signals,
  };
}
