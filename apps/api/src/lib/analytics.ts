import type { createLibsqlStore } from "@keenai/storage";
import {
  feedbackPosts,
  feedbackStatuses,
  helpArticles,
  kbQueryLogs,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@keenai/storage/schema";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export type AnalyticsDailyPoint = { day: string; count: number };

export type AnalyticsLabelCount = { label: string; count: number };

export type AnalyticsDashboard = {
  support: {
    ticketCount: number;
    openCount: number;
    doneCount: number;
    byStatus: AnalyticsLabelCount[];
    byType: AnalyticsLabelCount[];
    createdDaily: AnalyticsDailyPoint[];
  };
  feedback: {
    postCount: number;
    totalUpvotes: number;
    byStatus: AnalyticsLabelCount[];
    topPosts: { title: string; upvotes: number }[];
  };
  helpCenter: {
    searchCount: number;
    publishedArticles: number;
    searchesDaily: AnalyticsDailyPoint[];
    searchFeedback: AnalyticsLabelCount[];
  };
};

const DAILY_WINDOW_DAYS = 14;

export function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let offset = n - 1; offset >= 0; offset--) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function fillDailySeries(
  rows: AnalyticsDailyPoint[],
  days: string[],
): AnalyticsDailyPoint[] {
  const map = new Map(rows.map((row) => [row.day, row.count]));
  return days.map((day) => ({ day, count: map.get(day) ?? 0 }));
}

function dayStartDaysAgo(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

const ticketDayExpr = sql<string>`strftime('%Y-%m-%d', datetime(${tickets.createdAt} / 1000, 'unixepoch'))`;
const kbDayExpr = sql<string>`strftime('%Y-%m-%d', datetime(${kbQueryLogs.createdAt} / 1000, 'unixepoch'))`;

export async function getAnalyticsDashboard(db: Db, orgId: string): Promise<AnalyticsDashboard> {
  const days = lastNDays(DAILY_WINDOW_DAYS);
  const since = dayStartDaysAgo(DAILY_WINDOW_DAYS - 1);

  const [
    [ticketTotal],
    statusRows,
    typeRows,
    ticketDailyRows,
    [feedbackTotal],
    [upvoteTotal],
    feedbackStatusRows,
    topPostRows,
    [kbTotal],
    [publishedArticles],
    kbDailyRows,
    kbFeedbackRows,
  ] = await Promise.all([
    db.select({ n: count() }).from(tickets).where(eq(tickets.orgId, orgId)),
    db
      .select({
        label: sql<string>`coalesce(${ticketStatuses.name}, 'Unassigned')`,
        count: count(),
      })
      .from(tickets)
      .leftJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
      .where(eq(tickets.orgId, orgId))
      .groupBy(ticketStatuses.name)
      .orderBy(desc(count())),
    db
      .select({
        label: ticketTypes.kind,
        count: count(),
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
      .where(eq(tickets.orgId, orgId))
      .groupBy(ticketTypes.kind)
      .orderBy(desc(count())),
    db
      .select({ day: ticketDayExpr, count: count() })
      .from(tickets)
      .where(and(eq(tickets.orgId, orgId), gte(tickets.createdAt, since)))
      .groupBy(ticketDayExpr)
      .orderBy(ticketDayExpr),
    db.select({ n: count() }).from(feedbackPosts).where(eq(feedbackPosts.orgId, orgId)),
    db
      .select({ n: sql<number>`coalesce(sum(${feedbackPosts.upvoteCount}), 0)` })
      .from(feedbackPosts)
      .where(eq(feedbackPosts.orgId, orgId)),
    db
      .select({
        label: sql<string>`coalesce(${feedbackStatuses.name}, 'Open')`,
        count: count(),
      })
      .from(feedbackPosts)
      .leftJoin(feedbackStatuses, eq(feedbackPosts.statusId, feedbackStatuses.id))
      .where(eq(feedbackPosts.orgId, orgId))
      .groupBy(feedbackStatuses.name)
      .orderBy(desc(count())),
    db
      .select({
        title: feedbackPosts.title,
        upvotes: feedbackPosts.upvoteCount,
      })
      .from(feedbackPosts)
      .where(eq(feedbackPosts.orgId, orgId))
      .orderBy(desc(feedbackPosts.upvoteCount))
      .limit(8),
    db.select({ n: count() }).from(kbQueryLogs).where(eq(kbQueryLogs.orgId, orgId)),
    db
      .select({ n: count() })
      .from(helpArticles)
      .where(and(eq(helpArticles.orgId, orgId), eq(helpArticles.status, "published"))),
    db
      .select({ day: kbDayExpr, count: count() })
      .from(kbQueryLogs)
      .where(and(eq(kbQueryLogs.orgId, orgId), gte(kbQueryLogs.createdAt, since)))
      .groupBy(kbDayExpr)
      .orderBy(kbDayExpr),
    db
      .select({
        label: sql<string>`coalesce(${kbQueryLogs.userFeedback}, 'no_feedback')`,
        count: count(),
      })
      .from(kbQueryLogs)
      .where(eq(kbQueryLogs.orgId, orgId))
      .groupBy(kbQueryLogs.userFeedback)
      .orderBy(desc(count())),
  ]);

  const byStatus = statusRows.map((row) => ({ label: row.label, count: Number(row.count) }));
  const doneCount = byStatus
    .filter((row) => row.label.toLowerCase().includes("done"))
    .reduce((sum, row) => sum + row.count, 0);
  const ticketCount = ticketTotal?.n ?? 0;

  return {
    support: {
      ticketCount,
      openCount: Math.max(0, ticketCount - doneCount),
      doneCount,
      byStatus,
      byType: typeRows.map((row) => ({ label: row.label, count: Number(row.count) })),
      createdDaily: fillDailySeries(
        ticketDailyRows.map((row) => ({ day: row.day, count: Number(row.count) })),
        days,
      ),
    },
    feedback: {
      postCount: feedbackTotal?.n ?? 0,
      totalUpvotes: Number(upvoteTotal?.n ?? 0),
      byStatus: feedbackStatusRows.map((row) => ({
        label: row.label,
        count: Number(row.count),
      })),
      topPosts: topPostRows.map((row) => ({
        title: row.title,
        upvotes: row.upvotes,
      })),
    },
    helpCenter: {
      searchCount: kbTotal?.n ?? 0,
      publishedArticles: publishedArticles?.n ?? 0,
      searchesDaily: fillDailySeries(
        kbDailyRows.map((row) => ({ day: row.day, count: Number(row.count) })),
        days,
      ),
      searchFeedback: kbFeedbackRows.map((row) => ({
        label: row.label === "no_feedback" ? "No feedback" : row.label.replace("_", " "),
        count: Number(row.count),
      })),
    },
  };
}
