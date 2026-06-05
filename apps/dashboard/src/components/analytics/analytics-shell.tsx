"use client";

import { AppHeader } from "@/components/layout/app-header";
import { getAnalyticsSummary } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function AnalyticsShell() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: getAnalyticsSummary,
  });

  const cards = [
    { label: "Tickets", value: data?.support.ticketCount ?? 0 },
    { label: "Feedback posts", value: data?.feedback.postCount ?? 0 },
    { label: "HC searches", value: data?.helpCenter.searchCount ?? 0 },
  ];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Analytics" />

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading metrics…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5"
              >
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
