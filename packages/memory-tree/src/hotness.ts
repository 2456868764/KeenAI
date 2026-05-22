import type { KeenaiDb } from "@keenai/storage";
import {
  type MemoryHotnessSignals,
  conversations,
  memoryHotness,
  messages,
  tickets,
} from "@keenai/storage/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_HOTNESS_THRESHOLD,
  DEFAULT_HOTNESS_WEIGHTS,
  type HotnessWeights,
  computeHotnessScore,
} from "./hotness-config.js";

export type RefreshCustomerHotnessInput = {
  orgId: string;
  brandId: string;
  userId: string;
  weights?: HotnessWeights;
  threshold?: number;
  now?: Date;
};

export type RefreshCustomerHotnessResult = {
  userId: string;
  score: number;
  signals: MemoryHotnessSignals;
  hot: boolean;
  threshold: number;
};

const CUSTOMER_ENTITY_TYPE = "customer";

async function countMessages7d(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; userId: string; since: Date },
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
        eq(conversations.userId, input.userId),
        gte(messages.createdAt, input.since),
      ),
    );

  return Number(row?.count ?? 0);
}

async function countOpenTickets(
  db: KeenaiDb,
  input: { orgId: string; userId: string },
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(
      and(
        eq(tickets.orgId, input.orgId),
        eq(tickets.customerId, input.userId),
        isNull(tickets.closedAt),
      ),
    );

  return Number(row?.count ?? 0);
}

async function countNegativeCsat(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; userId: string },
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
        eq(conversations.userId, input.userId),
        sql`${conversations.rating} is not null and ${conversations.rating} <= 2`,
      ),
    );

  return Number(row?.count ?? 0);
}

/** Recompute and persist customer hotness (Memory Tree §4.2). */
export async function refreshCustomerHotness(
  db: KeenaiDb,
  input: RefreshCustomerHotnessInput,
): Promise<RefreshCustomerHotnessResult> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weights = input.weights ?? DEFAULT_HOTNESS_WEIGHTS;
  const threshold = input.threshold ?? DEFAULT_HOTNESS_THRESHOLD;

  const signals: MemoryHotnessSignals = {
    messageCount7d: await countMessages7d(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      userId: input.userId,
      since,
    }),
    openTicketCount: await countOpenTickets(db, {
      orgId: input.orgId,
      userId: input.userId,
    }),
    negativeCsatWeight: await countNegativeCsat(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      userId: input.userId,
    }),
    agentPinBoost: 0,
  };

  const score = computeHotnessScore(signals, weights);

  await db
    .insert(memoryHotness)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      entityType: CUSTOMER_ENTITY_TYPE,
      entityId: input.userId,
      score,
      signals,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        memoryHotness.orgId,
        memoryHotness.brandId,
        memoryHotness.entityType,
        memoryHotness.entityId,
      ],
      set: {
        score,
        signals,
        updatedAt: now,
      },
    });

  return {
    userId: input.userId,
    score,
    signals,
    hot: score >= threshold,
    threshold,
  };
}

export async function getCustomerHotness(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; userId: string },
): Promise<RefreshCustomerHotnessResult | null> {
  const [row] = await db
    .select()
    .from(memoryHotness)
    .where(
      and(
        eq(memoryHotness.orgId, input.orgId),
        eq(memoryHotness.brandId, input.brandId),
        eq(memoryHotness.entityType, CUSTOMER_ENTITY_TYPE),
        eq(memoryHotness.entityId, input.userId),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    userId: input.userId,
    score: row.score,
    signals: row.signals,
    hot: row.score >= DEFAULT_HOTNESS_THRESHOLD,
    threshold: DEFAULT_HOTNESS_THRESHOLD,
  };
}
