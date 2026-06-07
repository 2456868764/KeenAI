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
import { Button, Input, Sheet, SheetContent, SheetHeader, SheetTitle } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkflowBlockEditor } from "./workflow-block-editor";
import { WorkflowFlowCanvas } from "./workflow-flow-canvas";
import { highlightBlocksFromRunSteps } from "./workflow-graph";
import { WorkflowRunTrace } from "./workflow-run-trace";

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
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [triggerSheetOpen, setTriggerSheetOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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
  const selectedBlock =
    definition && selectedBlockId
      ? (definition.blocks.find((b) => b.id === selectedBlockId) ?? null)
      : null;
  const selectedIndex =
    definition && selectedBlock
      ? definition.blocks.findIndex((b) => b.id === selectedBlock.id)
      : -1;

  const updateBlock = (next: WorkflowBlock) => {
    if (!definition || selectedIndex < 0) return;
    const blocks = [...definition.blocks];
    blocks[selectedIndex] = next;
    setDefinition({ ...definition, blocks });
  };

  const runs = runsData?.items ?? [];
  const runHighlight = useMemo(() => {
    const run = runs.find((item) => item.id === selectedRunId);
    return run
      ? highlightBlocksFromRunSteps(run.steps)
      : { executed: new Set<string>(), failed: new Set<string>() };
  }, [runs, selectedRunId]);

  const clearFlowSelection = () => {
    setSelectedBlockId(null);
    setTriggerSheetOpen(false);
  };

  const triggerFields = definition ? (
    <>
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
    </>
  ) : null;

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

      <main
        className={[
          "mx-auto w-full flex-1 overflow-y-auto p-6",
          view === "flow" ? "max-w-7xl" : "max-w-5xl",
        ].join(" ")}
      >
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

            {view === "list" ? triggerFields : null}

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
                      onClick={() => {
                        setView("list");
                        clearFlowSelection();
                        setSelectedRunId(null);
                      }}
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
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <WorkflowFlowCanvas
                    definition={definition}
                    selectedBlockId={selectedBlockId}
                    triggerSelected={triggerSheetOpen}
                    runHighlight={runHighlight}
                    onSelectBlock={(blockId) => {
                      setSelectedBlockId(blockId);
                      setTriggerSheetOpen(false);
                    }}
                    onSelectTrigger={() => {
                      setTriggerSheetOpen(true);
                      setSelectedBlockId(null);
                    }}
                  />
                  <WorkflowRunTrace
                    runs={runs}
                    selectedRunId={selectedRunId}
                    onSelectRun={setSelectedRunId}
                  />
                </div>
              ) : (
                <ol className="space-y-3">
                  {definition.blocks.map((block, index) => (
                    <li
                      key={block.id}
                      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
                    >
                      <WorkflowBlockEditor
                        block={block}
                        index={index}
                        allBlocks={definition.blocks}
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
                Status: <span className="font-medium">{workflow.status}</span>
                {workflow.publishedDefinition ? (
                  <>
                    {" "}
                    · Published snapshot differs from draft:{" "}
                    <span className="font-medium">
                      {workflow.publishedDefinition.blocks.length !== definition.blocks.length ||
                      JSON.stringify(workflow.publishedDefinition) !== JSON.stringify(definition)
                        ? "yes"
                        : "no"}
                    </span>
                  </>
                ) : null}{" "}
                · Updated {new Date(workflow.updatedAt).toLocaleString()}
              </p>
            ) : null}

            {view === "list" ? (
              <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
                <h2 className="mb-3 text-sm font-medium">Recent runs</h2>
                {runs.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    No runs recorded yet.
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {runs.slice(0, 8).map((run) => (
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
            ) : null}
          </div>
        )}
      </main>

      <Sheet
        open={view === "flow" && selectedBlock !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedBlockId(null);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto">
          {selectedBlock && selectedIndex >= 0 ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedBlock.type.replaceAll("_", " ")}</SheetTitle>
              </SheetHeader>
              <WorkflowBlockEditor
                block={selectedBlock}
                index={selectedIndex}
                allBlocks={definition?.blocks ?? []}
                onChange={updateBlock}
                onRemove={() => {
                  if (!definition || definition.blocks.length <= 1) return;
                  setDefinition({
                    ...definition,
                    blocks: definition.blocks.filter((b) => b.id !== selectedBlock.id),
                  });
                  setSelectedBlockId(null);
                }}
              />
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={view === "flow" && triggerSheetOpen && definition !== null}
        onOpenChange={(open) => {
          if (!open) setTriggerSheetOpen(false);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto">
          {definition ? (
            <>
              <SheetHeader>
                <SheetTitle>Trigger</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">{triggerFields}</div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
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
        } else if (type === "branches") {
          onAdd({
            id,
            type: "branches",
            branches: [
              {
                label: "Email channel",
                condition: { field: "channelType", op: "eq", value: "email" },
                nextId: null,
              },
              { label: "Default", nextId: null },
            ],
          });
        } else if (type === "apply_rules") {
          onAdd({
            id,
            type: "apply_rules",
            rules: [
              {
                label: "Messenger",
                condition: { field: "channelType", op: "eq", value: "messenger" },
                nextId: `next-${id}`,
              },
            ],
          });
        } else if (type === "convert_to_ticket") {
          onAdd({ id, type: "convert_to_ticket", title: "" });
        } else if (type === "link_ticket") {
          onAdd({
            id,
            type: "link_ticket",
            childTicketId: "",
            linkType: "tracks",
          });
        } else if (type === "send_ticket_update") {
          onAdd({ id, type: "send_ticket_update" });
        } else if (type === "collect_data") {
          onAdd({
            id,
            type: "collect_data",
            prompt: "What is your email?",
            allowFreeText: false,
            fields: [{ key: "email", label: "Email", required: true }],
          });
        } else if (type === "reply_buttons") {
          onAdd({
            id,
            type: "reply_buttons",
            prompt: "How can we help?",
            allowFreeText: false,
            buttons: [
              { id: "sales", label: "Sales", nextId: null },
              { id: "support", label: "Support", nextId: null },
            ],
          });
        } else if (type === "snooze") {
          onAdd({ id, type: "snooze", minutes: 60 });
        } else if (type === "csat") {
          onAdd({
            id,
            type: "csat",
            prompt: "How would you rate this conversation?",
            allowComment: true,
            waitForRating: false,
          });
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
      <option value="branches">Branches</option>
      <option value="apply_rules">Apply rules (all-match)</option>
      <option value="convert_to_ticket">Convert to ticket</option>
      <option value="link_ticket">Link tickets</option>
      <option value="send_ticket_update">Send ticket update email</option>
      <option value="collect_data">Collect data (suspend)</option>
      <option value="reply_buttons">Reply buttons (suspend)</option>
      <option value="snooze">Snooze conversation</option>
      <option value="csat">CSAT rating</option>
    </select>
  );
}
