"use client";

import type { WorkflowRun } from "@/lib/api";

export function WorkflowRunTrace({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: WorkflowRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
}) {
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h3 className="text-sm font-medium">Run trace</h3>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No runs recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Run trace</h3>
        {selectedRunId ? (
          <button
            type="button"
            className="text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            onClick={() => onSelectRun(null)}
          >
            Clear highlight
          </button>
        ) : null}
      </div>
      <ul className="max-h-[280px] space-y-2 overflow-y-auto text-xs">
        {runs.slice(0, 12).map((run) => {
          const selected = run.id === selectedRunId;
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onSelectRun(selected ? null : run.id)}
                className={[
                  "w-full rounded border px-3 py-2 text-left transition-colors",
                  selected
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--surface-2))]"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--primary)/0.5)]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={[
                      "font-medium capitalize",
                      run.status === "failed" ? "text-red-400" : "",
                    ].join(" ")}
                  >
                    {run.status}
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                  {run.steps.length} step{run.steps.length === 1 ? "" : "s"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedRun ? (
        <ol className="mt-4 space-y-2 border-t border-[hsl(var(--border))] pt-4 text-xs">
          {selectedRun.steps.map((step, index) => (
            <li
              key={`${step.blockId}-${index}`}
              className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {index + 1}. {step.type.replaceAll("_", " ")}
                </span>
                <span
                  className={
                    step.status === "failed" || step.error
                      ? "text-red-400"
                      : "text-[hsl(var(--muted-foreground))]"
                  }
                >
                  {step.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                block: {step.blockId}
              </p>
              {step.error ? <p className="mt-1 text-red-400">{step.error}</p> : null}
              {step.output && Object.keys(step.output).length > 0 ? (
                <pre className="mt-2 max-h-24 overflow-auto rounded bg-[hsl(var(--surface-1))] p-2 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
          Select a run to highlight executed blocks on the flow canvas.
        </p>
      )}
    </div>
  );
}
