import type { createLibsqlStore } from "@keenai/storage";
import type { OfficeHoursSchedule } from "@keenai/storage/schema";
import { conversations, officeHours, slaBreachEvents, slaPolicies } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

const SLA_THRESHOLDS = [50, 80, 100] as const;

export type SerializedSlaPolicy = {
  id: string;
  orgId: string;
  name: string;
  firstResponseSec: number | null;
  resolutionSec: number | null;
  operationalHoursOnly: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SerializedOfficeHours = {
  id: string;
  orgId: string;
  timezone: string;
  schedule: OfficeHoursSchedule;
  holidays: string[];
  createdAt: string;
  updatedAt: string;
};

function serializePolicy(row: typeof slaPolicies.$inferSelect): SerializedSlaPolicy {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    firstResponseSec: row.firstResponseSec ?? null,
    resolutionSec: row.resolutionSec ?? null,
    operationalHoursOnly: row.operationalHoursOnly ?? false,
    enabled: row.enabled ?? true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeOfficeHours(row: typeof officeHours.$inferSelect): SerializedOfficeHours {
  return {
    id: row.id,
    orgId: row.orgId,
    timezone: row.timezone,
    schedule: row.schedule ?? {},
    holidays: row.holidays ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DEFAULT_SCHEDULE: OfficeHoursSchedule = {
  mon: [{ start: "09:00", end: "17:00" }],
  tue: [{ start: "09:00", end: "17:00" }],
  wed: [{ start: "09:00", end: "17:00" }],
  thu: [{ start: "09:00", end: "17:00" }],
  fri: [{ start: "09:00", end: "17:00" }],
};

export async function listSlaPolicies(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(slaPolicies)
    .where(eq(slaPolicies.orgId, orgId))
    .orderBy(desc(slaPolicies.updatedAt));
  return rows.map(serializePolicy);
}

export async function createSlaPolicy(
  db: Db,
  input: {
    orgId: string;
    name: string;
    firstResponseSec?: number;
    resolutionSec?: number;
    operationalHoursOnly?: boolean;
    enabled?: boolean;
  },
) {
  const [row] = await db
    .insert(slaPolicies)
    .values({
      orgId: input.orgId,
      name: input.name,
      firstResponseSec: input.firstResponseSec,
      resolutionSec: input.resolutionSec,
      operationalHoursOnly: input.operationalHoursOnly ?? false,
      enabled: input.enabled ?? true,
    })
    .returning();

  if (!row) throw new Error("policy_insert_failed");
  return serializePolicy(row);
}

export async function getOfficeHoursForOrg(db: Db, orgId: string) {
  const [row] = await db.select().from(officeHours).where(eq(officeHours.orgId, orgId)).limit(1);
  return row ? serializeOfficeHours(row) : null;
}

export async function upsertOfficeHours(
  db: Db,
  input: {
    orgId: string;
    timezone: string;
    schedule: OfficeHoursSchedule;
    holidays: string[];
  },
) {
  const existing = await getOfficeHoursForOrg(db, input.orgId);
  if (existing) {
    const [row] = await db
      .update(officeHours)
      .set({
        timezone: input.timezone,
        schedule: input.schedule,
        holidays: input.holidays,
        updatedAt: new Date(),
      })
      .where(eq(officeHours.id, existing.id))
      .returning();
    if (!row) throw new Error("office_hours_update_failed");
    return serializeOfficeHours(row);
  }

  const [row] = await db
    .insert(officeHours)
    .values({
      orgId: input.orgId,
      timezone: input.timezone,
      schedule: Object.keys(input.schedule).length > 0 ? input.schedule : DEFAULT_SCHEDULE,
      holidays: input.holidays,
    })
    .returning();

  if (!row) throw new Error("office_hours_insert_failed");
  return serializeOfficeHours(row);
}

export function isWithinOfficeHours(hours: SerializedOfficeHours, at: Date = new Date()): boolean {
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][at.getUTCDay()] ?? "mon";
  const dateKey = at.toISOString().slice(0, 10);
  if (hours.holidays.includes(dateKey)) return false;

  const slots = hours.schedule[dayKey] ?? [];
  if (slots.length === 0) return false;

  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return slots.some((slot) => {
    const [sh, sm] = slot.start.split(":").map(Number);
    const [eh, em] = slot.end.split(":").map(Number);
    const start = (sh ?? 0) * 60 + (sm ?? 0);
    const end = (eh ?? 0) * 60 + (em ?? 0);
    return minutes >= start && minutes < end;
  });
}

export async function ensureDefaultSlaPolicy(db: Db, orgId: string) {
  const existing = await listSlaPolicies(db, orgId);
  if (existing.length > 0) return existing[0] ?? null;

  return createSlaPolicy(db, {
    orgId,
    name: "Standard",
    firstResponseSec: 4 * 3600,
    resolutionSec: 24 * 3600,
    operationalHoursOnly: true,
    enabled: true,
  });
}

export async function recordSlaThresholdBreaches(
  db: Db,
  input: {
    orgId: string;
    conversationId: string;
    metric: "first_response" | "resolution";
    startedAt: Date;
    elapsedSec: number;
    limitSec: number;
    policyId?: string;
  },
) {
  const pct = Math.floor((input.elapsedSec / input.limitSec) * 100);
  const recorded = [];

  for (const threshold of SLA_THRESHOLDS) {
    if (pct < threshold) continue;

    const [existing] = await db
      .select({ id: slaBreachEvents.id })
      .from(slaBreachEvents)
      .where(
        and(
          eq(slaBreachEvents.conversationId, input.conversationId),
          eq(slaBreachEvents.metric, input.metric),
          eq(slaBreachEvents.thresholdPct, threshold),
        ),
      )
      .limit(1);

    if (existing) continue;

    const dueAt = new Date(input.startedAt.getTime() + input.limitSec * 1000);
    const [row] = await db
      .insert(slaBreachEvents)
      .values({
        orgId: input.orgId,
        conversationId: input.conversationId,
        policyId: input.policyId ?? null,
        metric: input.metric,
        thresholdPct: threshold,
        dueAt,
      })
      .returning();

    if (row) recorded.push(row);
  }

  return recorded;
}

export async function evaluateConversationSla(
  db: Db,
  input: { orgId: string; conversationId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);

  if (!conversation || conversation.status === "closed") return { breaches: [] };

  const policies = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.orgId, input.orgId), eq(slaPolicies.enabled, true)))
    .limit(1);

  const policy = policies[0];
  if (!policy) return { breaches: [] };

  const hours = await getOfficeHoursForOrg(db, input.orgId);
  if (policy.operationalHoursOnly && hours && !isWithinOfficeHours(hours, now)) {
    return { breaches: [], skipped: "outside_office_hours" as const };
  }

  const startedAt = conversation.createdAt;
  const elapsedSec = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const allBreaches = [];

  if (!conversation.firstResponseAt && policy.firstResponseSec) {
    const breaches = await recordSlaThresholdBreaches(db, {
      orgId: input.orgId,
      conversationId: conversation.id,
      metric: "first_response",
      startedAt,
      elapsedSec,
      limitSec: policy.firstResponseSec,
      policyId: policy.id,
    });
    allBreaches.push(...breaches);
  }

  if (!conversation.closedAt && policy.resolutionSec) {
    const breaches = await recordSlaThresholdBreaches(db, {
      orgId: input.orgId,
      conversationId: conversation.id,
      metric: "resolution",
      startedAt,
      elapsedSec,
      limitSec: policy.resolutionSec,
      policyId: policy.id,
    });
    allBreaches.push(...breaches);
  }

  return { breaches: allBreaches, policyId: policy.id };
}

export async function listSlaBreachesForConversation(
  db: Db,
  conversationId: string,
  orgId: string,
) {
  return db
    .select()
    .from(slaBreachEvents)
    .where(
      and(eq(slaBreachEvents.conversationId, conversationId), eq(slaBreachEvents.orgId, orgId)),
    )
    .orderBy(slaBreachEvents.thresholdPct);
}
