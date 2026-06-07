"use client";

import { evaluateConversationSla, listConversationSlaBreaches } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

function worstThreshold(items: { thresholdPct: number; metric: string }[]) {
  if (items.length === 0) return null;
  const worst = Math.max(...items.map((b) => b.thresholdPct));
  const metrics = [...new Set(items.filter((b) => b.thresholdPct === worst).map((b) => b.metric))];
  return { thresholdPct: worst, metrics };
}

export function SlaBreachBadge({ conversationId }: { conversationId: string }) {
  const { data } = useQuery({
    queryKey: ["sla-breaches", conversationId],
    queryFn: async () => {
      await evaluateConversationSla(conversationId);
      return listConversationSlaBreaches(conversationId);
    },
    refetchInterval: 60_000,
  });

  const summary = worstThreshold(data?.items ?? []);
  if (!summary) return null;

  const color =
    summary.thresholdPct >= 100
      ? "bg-red-500/15 text-red-400"
      : summary.thresholdPct >= 80
        ? "bg-orange-500/15 text-orange-400"
        : "bg-amber-500/15 text-amber-400";

  const metricLabel = summary.metrics
    .map((m) => (m === "first_response" ? "first response" : "resolution"))
    .join(", ");

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${color}`}
      title={`SLA ${summary.thresholdPct}% · ${metricLabel}`}
    >
      SLA {summary.thresholdPct}%
    </span>
  );
}
