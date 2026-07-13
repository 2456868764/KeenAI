import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, workflowRuns, workflows } from "@keenai/storage/schema";
import type { WorkflowAudienceRule, WorkflowDefinition } from "@keenai/workflow";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { executeWorkflow, resolveActiveWorkflowDefinition } from "./workflow-engine.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];
type ConversationRow = typeof conversations.$inferSelect;

export type ScheduleScanResult = {
  scanned: number;
  triggered: number;
  runs: string[];
  workflows: number;
};

function cronIntervalMinutes(cron: string): number | null {
  const parts = cron.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek, extra] = parts;
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek || extra) return null;
  const everyMinute = minute.match(/^\*\/(\d+)$/);
  if (everyMinute && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return Number.parseInt(everyMinute[1] ?? "", 10) || null;
  }

  const everyHour = hour.match(/^\*\/(\d+)$/);
  if (minute === "0" && everyHour && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const hours = Number.parseInt(everyHour[1] ?? "", 10);
    return hours > 0 ? hours * 60 : null;
  }

  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return 60;
  }

  if (minute === "0" && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*") {
    return dayOfWeek === "*" ? 24 * 60 : 7 * 24 * 60;
  }

  if (minute === "0" && /^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth) && month === "*") {
    return 31 * 24 * 60;
  }

  return null;
}

function fieldValue(conversation: ConversationRow, field: string): unknown {
  if (field === "channelType" || field === "channel") return conversation.channelType;
  if (field === "priority") return conversation.priority ?? "normal";
  if (field === "conversationStatus" || field === "status") return conversation.status;
  if (field === "brandId") return conversation.brandId;
  if (field === "userId") return conversation.userId;
  if (field === "tags" || field === "conv.tags") return conversation.tags;
  if (field.startsWith("attributes.") || field.startsWith("conv.attributes.")) {
    const key = field.replace(/^conv\./, "").slice("attributes.".length);
    return conversation.attributes[key];
  }
  return undefined;
}

function valueList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function matchesRule(conversation: ConversationRow, rule: WorkflowAudienceRule): boolean {
  const actual = fieldValue(conversation, rule.field);
  if (rule.op === "exists") return actual !== undefined && actual !== null;

  if (actual === undefined || actual === null) return false;
  if (rule.op === "eq") return actual === rule.value;
  if (rule.op === "ne") return actual !== rule.value;
  if (rule.op === "in") return valueList(rule.value).includes(actual);
  if (rule.op === "nin") return !valueList(rule.value).includes(actual);

  if (Array.isArray(actual)) {
    if (rule.op === "contains") return actual.includes(rule.value);
    return false;
  }

  const actualText = String(actual);
  const expectedText = String(rule.value ?? "");
  if (rule.op === "contains") return actualText.includes(expectedText);
  if (rule.op === "starts_with") return actualText.startsWith(expectedText);
  if (rule.op === "ends_with") return actualText.endsWith(expectedText);
  if (rule.op === "matches") {
    try {
      return new RegExp(expectedText).test(actualText);
    } catch {
      return false;
    }
  }
  return false;
}

function matchesAudience(definition: WorkflowDefinition, conversation: ConversationRow): boolean {
  const audience = definition.audience;
  const rules = audience?.rules ?? [];
  if (rules.length === 0) return true;
  const results = rules.map((rule) => matchesRule(conversation, rule));
  return audience?.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

async function hasRunSince(db: Db, workflowId: string, conversationId: string, since: Date) {
  const [row] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.conversationId, conversationId),
        gt(workflowRuns.createdAt, since),
      ),
    )
    .limit(1);
  return !!row;
}

export async function scanScheduledWorkflows(
  db: Db,
  opts: { env: ApiEnv; authConfig?: AuthConfig; now?: Date; orgId?: string },
): Promise<ScheduleScanResult> {
  const now = opts.now ?? new Date();
  const workflowFilters = [eq(workflows.status, "published"), eq(workflows.trigger, "schedule")];
  if (opts.orgId) workflowFilters.push(eq(workflows.orgId, opts.orgId));

  const published = await db
    .select()
    .from(workflows)
    .where(and(...workflowFilters));

  if (published.length === 0) {
    return { scanned: 0, triggered: 0, runs: [], workflows: 0 };
  }

  const orgIds = [...new Set(published.map((workflow) => workflow.orgId))];
  const candidates = await db
    .select()
    .from(conversations)
    .where(
      and(
        inArray(conversations.orgId, orgIds),
        eq(conversations.status, "open"),
        or(isNull(conversations.snoozedUntil), gt(conversations.snoozedUntil, now)),
      ),
    );

  const runs: string[] = [];
  let triggered = 0;

  for (const workflow of published) {
    const definition = resolveActiveWorkflowDefinition(workflow);
    const intervalMinutes = definition.cron ? cronIntervalMinutes(definition.cron) : null;
    if (!intervalMinutes) continue;

    const since = new Date(now.getTime() - intervalMinutes * 60_000);
    const matchingConversations = candidates.filter(
      (conversation) =>
        conversation.orgId === workflow.orgId &&
        (!workflow.brandId || workflow.brandId === conversation.brandId) &&
        matchesAudience(definition, conversation),
    );

    for (const conversation of matchingConversations) {
      if (await hasRunSince(db, workflow.id, conversation.id, since)) continue;

      const run = await executeWorkflow(db, workflow, conversation.id, opts.env, opts.authConfig, {
        facts: {
          channelType: conversation.channelType,
          priority: conversation.priority ?? "normal",
          conversationStatus: conversation.status,
        },
      });
      if (run) {
        runs.push(run.id);
        triggered += 1;
      }
    }
  }

  return { scanned: candidates.length, triggered, runs, workflows: published.length };
}
