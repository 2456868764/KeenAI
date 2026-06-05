"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type WorkflowBlock,
  type WorkflowDefinition,
  getWorkflow,
  listWorkflowRuns,
  publishWorkflow,
  updateWorkflow,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkflowFlowCanvas } from "./workflow-flow-canvas";

function newBlockId() {
  return `block-${Date.now().toString(36)}`;
}

export function WorkflowEditorShell({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => getWorkflow(workflowId),
  });

  const { data: runsData } = useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => listWorkflowRuns(workflowId),
  });

  const [name, setName] = useState("");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [view, setView] = useState<"list" | "flow">("flow");

  useEffect(() => {
    if (data?.workflow) {
      setName(data.workflow.name);
      setDefinition(data.workflow.definition);
    }
  }, [data?.workflow]);

  const save = useMutation({
    mutationFn: () => {
      if (!definition) throw new Error("Missing definition");
      return updateWorkflow(workflowId, { name, definition });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const publish = useMutation({
    mutationFn: () => publishWorkflow(workflowId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const workflow = data?.workflow;

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Workflow editor">
        <Link
          href="/workflows"
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          ← All workflows
        </Link>
        {workflow?.status === "draft" ? (
          <Button
            type="button"
            size="sm"
            disabled={publish.isPending || save.isPending}
            onClick={() => {
              save.mutate(undefined, {
                onSuccess: () => publish.mutate(),
              });
            }}
          >
            {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save & publish"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={save.isPending || !definition}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </AppHeader>

      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6">
        {isLoading || !definition ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              <label
                htmlFor="workflow-name"
                className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
              >
                Name
              </label>
              <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} />
            </section>

            <section className="space-y-2">
              <label
                htmlFor="workflow-trigger"
                className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
              >
                Trigger
              </label>
              <select
                id="workflow-trigger"
                value={definition.trigger}
                onChange={(e) =>
                  setDefinition({
                    ...definition,
                    trigger: e.target.value as WorkflowDefinition["trigger"],
                  })
                }
                className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
              >
                <option value="first_message">First customer message</option>
                <option value="customer_unresponsive">Customer unresponsive</option>
              </select>
            </section>

            {definition.trigger === "customer_unresponsive" ? (
              <section className="space-y-2">
                <label
                  htmlFor="workflow-inactivity"
                  className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                >
                  Inactivity (minutes after agent reply)
                </label>
                <Input
                  id="workflow-inactivity"
                  type="number"
                  min={0}
                  value={definition.inactivityMinutes ?? 30}
                  onChange={(e) =>
                    setDefinition({
                      ...definition,
                      inactivityMinutes: Number.parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium">Blocks</h2>
                  <div className="flex rounded-md border border-[hsl(var(--border))] p-0.5 text-xs">
                    <button
                      type="button"
                      className={
                        view === "flow"
                          ? "rounded px-2 py-0.5 bg-[hsl(var(--surface-2))] font-medium"
                          : "rounded px-2 py-0.5 text-[hsl(var(--muted-foreground))]"
                      }
                      onClick={() => setView("flow")}
                    >
                      Flow
                    </button>
                    <button
                      type="button"
                      className={
                        view === "list"
                          ? "rounded px-2 py-0.5 bg-[hsl(var(--surface-2))] font-medium"
                          : "rounded px-2 py-0.5 text-[hsl(var(--muted-foreground))]"
                      }
                      onClick={() => setView("list")}
                    >
                      List
                    </button>
                  </div>
                </div>
                <BlockAddMenu
                  onAdd={(block) =>
                    setDefinition({ ...definition, blocks: [...definition.blocks, block] })
                  }
                />
              </div>
              {view === "flow" ? (
                <WorkflowFlowCanvas definition={definition} onDefinitionChange={setDefinition} />
              ) : (
                <ol className="space-y-3">
                  {definition.blocks.map((block, index) => (
                    <li
                      key={block.id}
                      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
                    >
                      <BlockEditor
                        block={block}
                        index={index}
                        onChange={(next) => {
                          const blocks = [...definition.blocks];
                          blocks[index] = next;
                          setDefinition({ ...definition, blocks });
                        }}
                        onRemove={() => {
                          if (definition.blocks.length <= 1) return;
                          setDefinition({
                            ...definition,
                            blocks: definition.blocks.filter((_, i) => i !== index),
                          });
                        }}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {workflow ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Status: <span className="font-medium">{workflow.status}</span> · Updated{" "}
                {new Date(workflow.updatedAt).toLocaleString()}
              </p>
            ) : null}

            <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
              <h2 className="mb-3 text-sm font-medium">Recent runs</h2>
              {(runsData?.items ?? []).length === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">No runs recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {(runsData?.items ?? []).slice(0, 8).map((run) => (
                    <li
                      key={run.id}
                      className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{run.status}</span>
                        <span className="text-[hsl(var(--muted-foreground))]">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                        {run.steps.map((s) => `${s.type}:${s.status}`).join(" → ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function BlockAddMenu({ onAdd }: { onAdd: (block: WorkflowBlock) => void }) {
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const type = e.target.value;
        if (!type) return;
        e.target.value = "";
        const id = newBlockId();
        if (type === "send_message") {
          onAdd({ id, type: "send_message", plainText: "Hello!" });
        } else if (type === "assign") {
          onAdd({ id, type: "assign", assigneeId: null });
        } else if (type === "close") {
          onAdd({ id, type: "close" });
        } else if (type === "let_keeni_answer") {
          onAdd({ id, type: "let_keeni_answer", maxSteps: 8, instructions: "" });
        } else if (type === "wait") {
          onAdd({ id, type: "wait", seconds: 60 });
        } else if (type === "http_request") {
          onAdd({ id, type: "http_request", method: "GET", url: "https://example.com/hook" });
        }
      }}
      className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs"
    >
      <option value="">+ Add block</option>
      <option value="send_message">Send message</option>
      <option value="assign">Assign</option>
      <option value="close">Close conversation</option>
      <option value="let_keeni_answer">Let Keeni answer</option>
      <option value="wait">Wait</option>
      <option value="http_request">HTTP request</option>
    </select>
  );
}

function BlockEditor({
  block,
  index,
  onChange,
  onRemove,
}: {
  block: WorkflowBlock;
  index: number;
  onChange: (block: WorkflowBlock) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {index + 1}. {block.type.replace("_", " ")}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-red-400"
          title="Remove block"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {block.type === "send_message" ? (
        <>
          <textarea
            value={block.plainText ?? ""}
            onChange={(e) => onChange({ ...block, plainText: e.target.value })}
            rows={3}
            placeholder="Message text (optional if attachments are set)"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
          />
          <Input
            placeholder="Attachment IDs (comma-separated)"
            value={(block.attachmentIds ?? []).join(", ")}
            onChange={(e) => {
              const ids = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              onChange({ ...block, attachmentIds: ids.length > 0 ? ids : undefined });
            }}
            className="mt-2"
          />
        </>
      ) : null}

      {block.type === "assign" ? (
        <Input
          placeholder="Assignee member ID (optional)"
          value={block.assigneeId ?? ""}
          onChange={(e) => onChange({ ...block, assigneeId: e.target.value.trim() || null })}
        />
      ) : null}

      {block.type === "close" ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Closes the conversation when this step runs.
        </p>
      ) : null}

      {block.type === "let_keeni_answer" ? (
        <>
          <textarea
            value={block.instructions ?? ""}
            onChange={(e) => onChange({ ...block, instructions: e.target.value })}
            rows={3}
            placeholder="Optional instructions for the AI agent"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
          />
          <Input
            type="number"
            min={1}
            max={20}
            placeholder="Max agent steps"
            value={block.maxSteps ?? 8}
            onChange={(e) =>
              onChange({ ...block, maxSteps: Number.parseInt(e.target.value, 10) || 8 })
            }
          />
        </>
      ) : null}

      {block.type === "wait" ? (
        <Input
          type="number"
          min={1}
          max={86400}
          placeholder="Seconds to wait"
          value={block.seconds}
          onChange={(e) =>
            onChange({ ...block, seconds: Number.parseInt(e.target.value, 10) || 60 })
          }
        />
      ) : null}

      {block.type === "http_request" ? (
        <>
          <select
            value={block.method}
            onChange={(e) => onChange({ ...block, method: e.target.value as "GET" | "POST" })}
            className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <Input
            placeholder="URL"
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            className="mt-2"
          />
          {block.method === "POST" ? (
            <textarea
              value={block.body ?? ""}
              onChange={(e) => onChange({ ...block, body: e.target.value })}
              rows={3}
              placeholder="JSON body (optional)"
              className="mt-2 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
