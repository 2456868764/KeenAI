"use client";

import {
  type AgentRun,
  type AgentRunStatus,
  decideAgentApproval,
  getAgentRunTrace,
  listAgentRuns,
  resumeAgentRun,
} from "@/lib/api";
import { Button, cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const phases = ["plan", "retrieve", "act", "observe", "escalate"] as const;
const statusOptions: Array<{ value: "all" | AgentRunStatus; label: string }> = [
  { value: "all", label: "All runs" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "completed", label: "Completed" },
  { value: "escalated", label: "Escalated" },
  { value: "failed", label: "Failed" },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function runTitle(run: AgentRun): string {
  const instruction = run.inputSnapshot.instruction;
  if (typeof instruction === "string" && instruction.trim()) return instruction;
  const subject = run.inputSnapshot.subject;
  if (typeof subject === "string" && subject.trim()) return subject;
  return run.trigger.replaceAll("_", " ");
}

function StatusBadge({ status }: { status: AgentRunStatus }) {
  const tones: Record<AgentRunStatus, string> = {
    created: "bg-slate-100 text-slate-700",
    planning: "bg-blue-50 text-blue-700",
    retrieving: "bg-cyan-50 text-cyan-700",
    awaiting_approval: "bg-amber-50 text-amber-800",
    acting: "bg-violet-50 text-violet-700",
    observing: "bg-indigo-50 text-indigo-700",
    completed: "bg-emerald-50 text-emerald-700",
    escalated: "bg-orange-50 text-orange-800",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={cn("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold", tones[status])}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function AgentRunTraceShell() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"all" | AgentRunStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("runId"));
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const runsQuery = useQuery({
    queryKey: ["agent-runs", status],
    queryFn: () => listAgentRuns({ status: status === "all" ? undefined : status, limit: 100 }),
    refetchInterval: 15_000,
  });
  const runs = runsQuery.data?.items ?? [];

  useEffect(() => {
    if (!selectedId && runs[0]) setSelectedId(runs[0].id);
  }, [runs, selectedId]);

  const traceQuery = useQuery({
    queryKey: ["agent-run", selectedId],
    queryFn: () => getAgentRunTrace(selectedId as string),
    enabled: Boolean(selectedId),
    refetchInterval: (query) => {
      const value = query.state.data?.run.status;
      return value && ["completed", "escalated", "failed"].includes(value) ? false : 5_000;
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["agent-run", selectedId] });
  };
  const approval = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "rejected"; reason?: string }) =>
      decideAgentApproval(input.id, input.decision, input.reason),
    onSuccess: () => {
      setRejectingApprovalId(null);
      setRejectionReason("");
      refresh();
    },
  });
  const resume = useMutation({
    mutationFn: (runId: string) => resumeAgentRun(runId),
    onSuccess: refresh,
  });
  const trace = traceQuery.data;
  const eventPhases = useMemo(
    () => new Set(trace?.events.map((event) => event.phase) ?? []),
    [trace?.events],
  );

  return (
    <div className="flex h-full min-h-0 bg-[hsl(var(--surface-0))] text-[hsl(var(--text-primary))]">
      <section className="flex w-[330px] shrink-0 flex-col border-r border-[hsl(var(--border-subtle))]">
        <header className="border-b border-[hsl(var(--border-subtle))] px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Agent runs</h1>
              <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">
                Auditable execution history
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="grid size-8 place-items-center rounded border border-[hsl(var(--border-subtle))]"
              aria-label="Refresh runs"
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | AgentRunStatus)}
            className="mt-4 h-9 w-full rounded border border-[hsl(var(--border-subtle))] bg-transparent px-3 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {runsQuery.isLoading && <Loading label="Loading runs" />}
          {!runsQuery.isLoading && runs.length === 0 && (
            <EmptyState label="No agent runs match this filter." />
          )}
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => setSelectedId(run.id)}
              className={cn(
                "w-full border-b border-[hsl(var(--border-subtle))] px-5 py-4 text-left transition-colors",
                selectedId === run.id
                  ? "bg-[hsl(var(--surface-1))]"
                  : "hover:bg-[hsl(var(--surface-1))]/60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="line-clamp-2 text-sm font-medium">{runTitle(run)}</span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-[hsl(var(--text-muted))]" />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <StatusBadge status={run.status} />
                <span className="text-[11px] text-[hsl(var(--text-muted))]">
                  {formatDate(run.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {!selectedId && <EmptyState label="Select a run to inspect its trace." />}
        {selectedId && traceQuery.isLoading && <Loading label="Loading trace" />}
        {trace && (
          <div className="mx-auto w-full max-w-6xl px-7 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[hsl(var(--border-subtle))] pb-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="max-w-3xl truncate text-xl font-semibold">
                    {runTitle(trace.run)}
                  </h2>
                  <StatusBadge status={trace.run.status} />
                </div>
                <p className="mt-2 font-mono text-xs text-[hsl(var(--text-muted))]">
                  {trace.run.id}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs font-medium",
                    trace.integrity.valid ? "text-emerald-700" : "text-red-700",
                  )}
                >
                  Audit chain {trace.integrity.valid ? "verified" : "invalid"} ·{" "}
                  {trace.integrity.checked} events checked
                </p>
              </div>
              <div className="flex items-center gap-2">
                {trace.run.conversationId && (
                  <Link href={`/dashboard/inbox?conversationId=${trace.run.conversationId}`}>
                    <Button variant="outline" size="sm">
                      Conversation <ExternalLink className="ml-1 size-3.5" />
                    </Button>
                  </Link>
                )}
                {trace.run.status === "awaiting_approval" && (
                  <Button
                    size="sm"
                    onClick={() => resume.mutate(trace.run.id)}
                    disabled={resume.isPending}
                  >
                    <Play className="mr-1 size-3.5" /> Resume
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 border-b border-[hsl(var(--border-subtle))] py-5">
              {phases.map((phase, index) => {
                const reached = eventPhases.has(phase);
                return (
                  <div key={phase} className="relative flex items-center gap-2">
                    {index > 0 && (
                      <span
                        className={cn(
                          "absolute right-1/2 h-px w-full",
                          reached ? "bg-emerald-400" : "bg-slate-200",
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 grid size-6 place-items-center rounded-full border text-[10px] font-semibold uppercase",
                        reached
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-300 bg-white text-slate-500",
                      )}
                    >
                      {reached ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className="relative z-10 bg-[hsl(var(--surface-0))] pr-2 text-xs font-semibold capitalize">
                      {phase}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <TraceSection icon={ShieldCheck} title="Plan">
                  {trace.plans[0] ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <Metric label="Intent" value={trace.plans[0].intent} />
                        <Metric label="Risk" value={trace.plans[0].riskLevel.toUpperCase()} />
                      </div>
                      <p className="text-sm">{trace.plans[0].objective}</p>
                      <ol className="space-y-2 text-sm text-[hsl(var(--text-secondary))]">
                        {trace.plans[0].steps.map((step, index) => (
                          <li key={step} className="flex gap-3">
                            <span className="font-mono text-xs text-[hsl(var(--text-muted))]">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <EmptyLine label="No persisted plan." />
                  )}
                </TraceSection>

                <TraceSection icon={Database} title={`Evidence (${trace.evidence.length})`}>
                  {trace.evidence.length > 0 ? (
                    <div className="divide-y divide-[hsl(var(--border-subtle))]">
                      {trace.evidence.map((item) => (
                        <div
                          key={item.id}
                          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[150px_1fr_auto]"
                        >
                          <span className="text-xs font-semibold uppercase text-[hsl(var(--text-muted))]">
                            {item.sourceType}
                          </span>
                          <code className="min-w-0 truncate text-xs">{item.sourceId}</code>
                          <span className="text-xs tabular-nums text-[hsl(var(--text-muted))]">
                            {item.score == null ? "-" : item.score.toFixed(3)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyLine label="No source evidence was retained." />
                  )}
                </TraceSection>

                <TraceSection icon={Wrench} title={`Actions (${trace.toolCalls.length})`}>
                  {trace.toolCalls.length > 0 ? (
                    <div className="space-y-3">
                      {trace.toolCalls.map((call) => (
                        <div
                          key={call.id}
                          className="border-b border-[hsl(var(--border-subtle))] pb-3 last:border-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{call.toolName}</span>
                              <span className="text-[11px] uppercase text-[hsl(var(--text-muted))]">
                                {call.riskLevel}
                              </span>
                            </div>
                            <span className="text-xs font-medium">
                              {call.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-[hsl(var(--surface-1))] p-3 text-[11px]">
                            {JSON.stringify(call.arguments, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyLine label="This run did not call a tool." />
                  )}
                </TraceSection>

                <TraceSection icon={Clock3} title="Event timeline">
                  <div className="space-y-0">
                    {trace.events.map((event) => (
                      <div
                        key={event.id}
                        className="grid grid-cols-[34px_1fr_auto] gap-2 border-b border-[hsl(var(--border-subtle))] py-3 last:border-0"
                      >
                        <span className="font-mono text-xs text-[hsl(var(--text-muted))]">
                          {event.sequence}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{event.eventType}</p>
                          <p className="mt-0.5 text-xs capitalize text-[hsl(var(--text-muted))]">
                            {event.phase} · {event.actorType}
                          </p>
                        </div>
                        <time className="text-[11px] text-[hsl(var(--text-muted))]">
                          {formatDate(event.createdAt)}
                        </time>
                      </div>
                    ))}
                  </div>
                </TraceSection>
              </div>

              <aside className="space-y-5">
                <TraceSection icon={CheckCircle2} title="Evaluation">
                  {trace.evaluations[0] ? (
                    <div>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-semibold tabular-nums">
                          {Math.round(trace.evaluations[0].score * 100)}
                        </span>
                        <span className="pb-1 text-xs text-[hsl(var(--text-muted))]">/ 100</span>
                      </div>
                      <div className="mt-4 space-y-2 text-xs">
                        <CheckLine label="Plan complete" ok={trace.evaluations[0].planComplete} />
                        <CheckLine
                          label="Actions verified"
                          ok={trace.evaluations[0].actionVerified}
                        />
                        <CheckLine
                          label="Evidence coverage"
                          ok={trace.evaluations[0].evidenceCoverage >= 1}
                        />
                        <CheckLine
                          label="Citation coverage"
                          ok={trace.evaluations[0].citationCoverage >= 1}
                        />
                        <CheckLine
                          label="Tool success"
                          ok={trace.evaluations[0].toolSuccessRate >= 1}
                        />
                      </div>
                      {trace.evaluations[0].issues.length > 0 && (
                        <div className="mt-4 space-y-1 border-t border-[hsl(var(--border-subtle))] pt-3">
                          {trace.evaluations[0].issues.map((issue) => (
                            <p key={issue} className="text-xs text-amber-700">
                              {issue.replaceAll("_", " ")}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyLine label="Evaluation pending." />
                  )}
                </TraceSection>

                {trace.approvals.map((item) => (
                  <TraceSection key={item.id} icon={ShieldCheck} title="Approval">
                    <p className="text-sm font-semibold">{item.toolName}</p>
                    <p className="mt-1 text-xs capitalize text-[hsl(var(--text-muted))]">
                      {item.status} · {item.riskLevel.toUpperCase()} · {item.approvalCount}/
                      {item.requiredApprovals} approvals
                    </p>
                    <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-[hsl(var(--surface-1))] p-3 text-[11px]">
                      {JSON.stringify(item.argumentsPreview, null, 2)}
                    </pre>
                    {item.expiresAt && (
                      <p className="mt-2 text-[11px] text-[hsl(var(--text-muted))]">
                        Expires {formatDate(item.expiresAt)}
                      </p>
                    )}
                    {item.status === "pending" && (
                      <div className="mt-4 space-y-3">
                        {rejectingApprovalId === item.id && (
                          <textarea
                            value={rejectionReason}
                            onChange={(event) => setRejectionReason(event.target.value)}
                            placeholder="Reason for rejection"
                            className="min-h-20 w-full resize-y rounded border border-[hsl(var(--border-subtle))] bg-transparent p-2 text-xs"
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => approval.mutate({ id: item.id, decision: "approved" })}
                            disabled={approval.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (rejectingApprovalId !== item.id) {
                                setRejectingApprovalId(item.id);
                                return;
                              }
                              if (!rejectionReason.trim()) return;
                              approval.mutate({
                                id: item.id,
                                decision: "rejected",
                                reason: rejectionReason.trim(),
                              });
                            }}
                            disabled={approval.isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </TraceSection>
                ))}

                {trace.escalations.map((item) => (
                  <TraceSection key={item.id} icon={AlertTriangle} title="Escalation">
                    <p className="text-sm font-semibold">{item.reasonCode.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs capitalize text-[hsl(var(--text-muted))]">
                      {item.severity} · {item.status}
                    </p>
                    {item.recommendedNextAction && (
                      <p className="mt-3 text-xs leading-5 text-[hsl(var(--text-secondary))]">
                        {item.recommendedNextAction}
                      </p>
                    )}
                  </TraceSection>
                ))}
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TraceSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-[hsl(var(--text-muted))]" />
        {title}
      </h3>
      <div className="rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-0))] p-4">
        {children}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[hsl(var(--text-muted))]">{label}: </span>
      <strong>{value}</strong>
    </span>
  );
}

function CheckLine({ label, ok }: { label: string; ok: boolean }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <Icon className={cn("size-4", ok ? "text-emerald-600" : "text-amber-600")} />
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-[hsl(var(--text-muted))]">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid h-48 place-items-center px-6 text-sm text-[hsl(var(--text-muted))]">
      {label}
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <p className="text-sm text-[hsl(var(--text-muted))]">{label}</p>;
}
