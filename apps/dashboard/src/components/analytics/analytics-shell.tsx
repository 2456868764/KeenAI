"use client";

import { AppHeader } from "@/components/layout/app-header";
import { type AnalyticsDashboard, getAnalyticsDashboard } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AnalyticsChart, barOption, lineOption, pieOption } from "./analytics-chart";

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DashboardSection({
  title,
  description,
  metrics,
  children,
}: {
  title: string;
  description: string;
  metrics: { label: string; value: number }[];
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function SupportCharts({ data }: { data: AnalyticsDashboard["support"] }) {
  return (
    <>
      <AnalyticsChart
        option={pieOption({
          title: "Tickets by status",
          data: data.byStatus.map((row) => ({ name: row.label, value: row.count })),
        })}
      />
      <AnalyticsChart
        option={pieOption({
          title: "Tickets by type",
          data: data.byType.map((row) => ({ name: row.label, value: row.count })),
        })}
      />
      <div className="lg:col-span-2">
        <AnalyticsChart
          option={lineOption({
            title: "Tickets created (14 days)",
            days: data.createdDaily.map((row) => row.day),
            values: data.createdDaily.map((row) => row.count),
          })}
          height={220}
        />
      </div>
    </>
  );
}

function FeedbackCharts({ data }: { data: AnalyticsDashboard["feedback"] }) {
  return (
    <>
      <AnalyticsChart
        option={pieOption({
          title: "Posts by status",
          data: data.byStatus.map((row) => ({ name: row.label, value: row.count })),
        })}
      />
      <AnalyticsChart
        option={barOption({
          title: "Top posts by upvotes",
          categories: data.topPosts.map((row) => row.title),
          values: data.topPosts.map((row) => row.upvotes),
          horizontal: true,
        })}
        height={Math.max(220, data.topPosts.length * 36)}
      />
    </>
  );
}

function HelpCenterCharts({ data }: { data: AnalyticsDashboard["helpCenter"] }) {
  return (
    <>
      <AnalyticsChart
        option={lineOption({
          title: "HC searches (14 days)",
          days: data.searchesDaily.map((row) => row.day),
          values: data.searchesDaily.map((row) => row.count),
        })}
      />
      <AnalyticsChart
        option={pieOption({
          title: "Search feedback",
          data: data.searchFeedback.map((row) => ({ name: row.label, value: row.count })),
        })}
      />
    </>
  );
}

export function AnalyticsShell() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: getAnalyticsDashboard,
  });

  const dashboard = data?.dashboard;

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Analytics" />

      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading metrics…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : dashboard ? (
          <div className="space-y-6">
            <DashboardSection
              title="Support"
              description="Ticket volume, status mix, and creation trend."
              metrics={[
                { label: "Total tickets", value: dashboard.support.ticketCount },
                { label: "Open", value: dashboard.support.openCount },
                { label: "Done", value: dashboard.support.doneCount },
              ]}
            >
              <SupportCharts data={dashboard.support} />
            </DashboardSection>

            <DashboardSection
              title="Feedback"
              description="Ideas board activity and voting leaders."
              metrics={[
                { label: "Posts", value: dashboard.feedback.postCount },
                { label: "Total upvotes", value: dashboard.feedback.totalUpvotes },
                { label: "Statuses tracked", value: dashboard.feedback.byStatus.length },
              ]}
            >
              <FeedbackCharts data={dashboard.feedback} />
            </DashboardSection>

            <DashboardSection
              title="Help Center"
              description="Published articles and KB search usage."
              metrics={[
                { label: "Published articles", value: dashboard.helpCenter.publishedArticles },
                { label: "Total searches", value: dashboard.helpCenter.searchCount },
                {
                  label: "Searches (14d)",
                  value: dashboard.helpCenter.searchesDaily.reduce(
                    (sum, row) => sum + row.count,
                    0,
                  ),
                },
              ]}
            >
              <HelpCenterCharts data={dashboard.helpCenter} />
            </DashboardSection>
          </div>
        ) : null}
      </main>
    </div>
  );
}
