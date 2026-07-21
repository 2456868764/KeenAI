"use client";

import {
  type Workflow,
  type WorkflowBlock,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowVersion,
  archiveWorkflow,
  duplicateWorkflow,
  getWorkflow,
  listWorkflowRuns,
  listWorkflowVersions,
  publishWorkflow,
  rollbackWorkflow,
  runWorkflowShadow,
  testWorkflow,
  unpublishWorkflow,
  updateWorkflow,
} from "@/lib/api";
import { Button, Input, cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Braces,
  ChevronDown,
  Clock3,
  Copy,
  FileInput,
  GitBranch,
  Globe2,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Send,
  Star,
  Tag,
  TestTube2,
  Ticket,
  Trash2,
  UserCheck,
  Webhook,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { WorkflowBlockEditor } from "./workflow-block-editor";
import { type WorkflowCanvasInsertAnchor, WorkflowFlowCanvas } from "./workflow-flow-canvas";
import { highlightBlocksFromRunSteps } from "./workflow-graph";
import { WorkflowRunTrace } from "./workflow-run-trace";

function newBlockId() {
  return `block-${Date.now().toString(36)}`;
}

const TRIGGER_OPTIONS: { value: WorkflowDefinition["trigger"]; label: string }[] = [
  { value: "page_view", label: "Page view" },
  { value: "new_messenger_conversation", label: "New messenger conversation" },
  { value: "first_message", label: "First customer message" },
  { value: "any_message", label: "Any message" },
  { value: "teammate_message", label: "Teammate message" },
  { value: "conversation_state_changed", label: "Conversation state changed" },
  { value: "assigned_to_team", label: "Assigned to team" },
  { value: "assigned_to_member", label: "Assigned to member" },
  { value: "customer_unresponsive", label: "Customer unresponsive" },
  { value: "teammate_unresponsive", label: "Teammate unresponsive" },
  { value: "teammate_added_note", label: "Teammate added note" },
  { value: "ticket_created", label: "Ticket created" },
  { value: "ticket_state_changed", label: "Ticket state changed" },
  { value: "schedule", label: "Schedule" },
  { value: "webhook", label: "Webhook" },
  { value: "event_match", label: "Custom event" },
];

function workflowAddMenuTitle(anchor: WorkflowCanvasInsertAnchor): string {
  switch (anchor.kind) {
    case "trigger":
      return "Add first action";
    case "block":
      return "Insert action";
    case "branch":
    case "branch_else":
    case "rule":
    case "button":
    case "outcome":
      return "Connect output";
  }
}

function workflowAddMenuDescription(anchor: WorkflowCanvasInsertAnchor): string {
  switch (anchor.kind) {
    case "trigger":
      return "Choose the first workflow component after the trigger.";
    case "block":
      return "Choose a workflow component to insert after this step.";
    case "branch":
      return "Choose the action that should run when this branch matches.";
    case "branch_else":
      return "Choose the fallback action for conversations that do not match earlier branches.";
    case "rule":
      return "Choose the action that should run when this rule matches.";
    case "button":
      return "Choose the action that should run after this reply button is selected.";
    case "outcome":
      return "Choose the action that should run for this AI outcome.";
  }
}

function workflowResultStatus(
  result: { steps: WorkflowRun["steps"]; suspended?: unknown },
  fallback: string,
) {
  if (result.steps.some((step) => step.status === "failed" || step.error)) return "failed";
  if (result.suspended) return "suspended";
  return fallback;
}

export function WorkflowEditorShell({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => getWorkflow(workflowId),
  });

  const { data: runsData } = useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => listWorkflowRuns(workflowId),
  });

  const [manageOpen, setManageOpen] = useState(false);
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [triggerPanelOpen, setTriggerPanelOpen] = useState(false);
  const [descriptionPanelOpen, setDescriptionPanelOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [addAnchor, setAddAnchor] = useState<WorkflowCanvasInsertAnchor | null>(null);
  const [dryRuns, setDryRuns] = useState<WorkflowRun[]>([]);
  const [definitionHistory, setDefinitionHistory] = useState<{
    past: WorkflowDefinition[];
    future: WorkflowDefinition[];
  }>({ past: [], future: [] });

  const { data: versionsData } = useQuery({
    queryKey: ["workflow-versions", workflowId],
    queryFn: () => listWorkflowVersions(workflowId),
    enabled: manageOpen,
  });

  useEffect(() => {
    if (data?.workflow) {
      setName(data.workflow.name);
      setDefinition(data.workflow.definition);
      setDefinitionHistory({ past: [], future: [] });
    }
  }, [data?.workflow]);

  const commitDefinition = (next: WorkflowDefinition) => {
    if (!definition) {
      setDefinition(next);
      return;
    }
    if (JSON.stringify(definition) === JSON.stringify(next)) return;
    setDefinitionHistory((history) => ({
      past: [...history.past.slice(-49), definition],
      future: [],
    }));
    setDefinition(next);
  };

  const resetDefinition = (next: WorkflowDefinition) => {
    setDefinition(next);
    setDefinitionHistory({ past: [], future: [] });
  };

  const undoDefinition = () => {
    if (!definition || definitionHistory.past.length === 0) return;
    const previous = definitionHistory.past.at(-1);
    if (!previous) return;
    setDefinition(previous);
    setDefinitionHistory((history) => ({
      past: history.past.slice(0, -1),
      future: [definition, ...history.future].slice(0, 50),
    }));
    clearFlowSelection();
  };

  const redoDefinition = () => {
    if (!definition || definitionHistory.future.length === 0) return;
    const next = definitionHistory.future[0];
    if (!next) return;
    setDefinition(next);
    setDefinitionHistory((history) => ({
      past: [...history.past.slice(-49), definition],
      future: history.future.slice(1),
    }));
    clearFlowSelection();
  };

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
      void queryClient.invalidateQueries({ queryKey: ["workflow-versions", workflowId] });
    },
  });

  const unpublish = useMutation({
    mutationFn: () => unpublishWorkflow(workflowId),
    onSuccess: (result) => {
      setManageOpen(false);
      resetDefinition(result.workflow.definition);
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const duplicate = useMutation({
    mutationFn: () => duplicateWorkflow(workflowId),
    onSuccess: (result) => {
      setManageOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      router.push(`/workflows/${result.workflow.id}`);
    },
  });

  const archive = useMutation({
    mutationFn: () => archiveWorkflow(workflowId),
    onSuccess: () => {
      setManageOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      router.push("/workflows");
    },
  });

  const rollback = useMutation({
    mutationFn: (version: number) => rollbackWorkflow(workflowId, version),
    onSuccess: (result) => {
      setManageOpen(false);
      setName(result.workflow.name);
      resetDefinition(result.workflow.definition);
      setSelectedBlockId(null);
      setTriggerPanelOpen(false);
      setAddAnchor(null);
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflow-versions", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const testRun = useMutation({
    mutationFn: () => testWorkflow(workflowId),
    onSuccess: (data) => {
      const run: WorkflowRun = {
        id: `dry-run-${Date.now()}`,
        workflowId,
        conversationId: "dry-run-conversation",
        status: workflowResultStatus(data.result, "dry-run"),
        steps: data.result.steps,
        createdAt: new Date().toISOString(),
      };
      setDryRuns((items) => [run, ...items].slice(0, 5));
      setSelectedRunId(run.id);
      setSelectedBlockId(null);
      setTriggerPanelOpen(false);
      setAddAnchor(null);
    },
  });

  const shadowRun = useMutation({
    mutationFn: () => runWorkflowShadow(workflowId, { limit: 5 }),
    onSuccess: (data) => {
      const createdAt = new Date().toISOString();
      const runId = Date.now();
      const runs: WorkflowRun[] =
        data.items.length > 0
          ? data.items.map((item, index) => ({
              id: `shadow-${runId}-${index}`,
              workflowId,
              conversationId: item.conversationId,
              status: workflowResultStatus(item.result, "shadow"),
              steps: item.result.steps,
              createdAt,
            }))
          : [
              {
                id: `shadow-${runId}-empty`,
                workflowId,
                conversationId: "no-closed-conversations",
                status: "no samples",
                steps: [],
                createdAt,
              },
            ];
      setDryRuns((items) => [...runs, ...items].slice(0, 12));
      setSelectedRunId(runs[0]?.id ?? null);
      setSelectedBlockId(null);
      setTriggerPanelOpen(false);
      setAddAnchor(null);
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
    commitDefinition({ ...definition, blocks });
  };

  const insertBlock = (block: WorkflowBlock, anchor?: WorkflowCanvasInsertAnchor | null) => {
    if (!definition) return;
    const blocks = [...definition.blocks];
    if (anchor?.kind === "trigger") {
      blocks.splice(0, 0, block);
    } else if (anchor?.kind === "block") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      blocks.splice(index >= 0 ? index + 1 : blocks.length, 0, block);
    } else if (anchor?.kind === "branch") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      const parent = blocks[index];
      if (parent?.type === "branches") {
        blocks[index] = {
          ...parent,
          branches: parent.branches.map((branch, branchIndex) =>
            branchIndex === anchor.branchIndex ? { ...branch, nextId: block.id } : branch,
          ),
        };
        blocks.splice(index + 1, 0, block);
      } else {
        blocks.push(block);
      }
    } else if (anchor?.kind === "branch_else") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      const parent = blocks[index];
      if (parent?.type === "branches") {
        blocks[index] = { ...parent, elseNextId: block.id };
        blocks.splice(index + 1, 0, block);
      } else {
        blocks.push(block);
      }
    } else if (anchor?.kind === "rule") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      const parent = blocks[index];
      if (parent?.type === "apply_rules") {
        blocks[index] = {
          ...parent,
          rules: parent.rules.map((rule, ruleIndex) =>
            ruleIndex === anchor.ruleIndex ? { ...rule, nextId: block.id } : rule,
          ),
        };
        blocks.splice(index + 1, 0, block);
      } else {
        blocks.push(block);
      }
    } else if (anchor?.kind === "button") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      const parent = blocks[index];
      if (parent?.type === "reply_buttons") {
        blocks[index] = {
          ...parent,
          buttons: parent.buttons.map((button) =>
            button.id === anchor.buttonId ? { ...button, nextId: block.id } : button,
          ),
        };
        blocks.splice(index + 1, 0, block);
      } else {
        blocks.push(block);
      }
    } else if (anchor?.kind === "outcome") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      const parent = blocks[index];
      if (parent?.type === "let_keeni_answer") {
        const outcomeRouting = {
          resolvedNext: parent.outcomeRouting?.resolvedNext ?? null,
          unresolvedNext: parent.outcomeRouting?.unresolvedNext ?? null,
          escalatedNext: parent.outcomeRouting?.escalatedNext ?? null,
        };
        if (anchor.outcome === "resolved") outcomeRouting.resolvedNext = block.id;
        if (anchor.outcome === "unresolved") outcomeRouting.unresolvedNext = block.id;
        if (anchor.outcome === "escalated") outcomeRouting.escalatedNext = block.id;
        blocks[index] = { ...parent, outcomeRouting };
        blocks.splice(index + 1, 0, block);
      } else {
        blocks.push(block);
      }
    } else {
      blocks.push(block);
    }
    commitDefinition({ ...definition, blocks });
    setSelectedBlockId(block.id);
    setTriggerPanelOpen(false);
    setAddAnchor(null);
  };

  const runs = useMemo(() => [...dryRuns, ...(runsData?.items ?? [])], [dryRuns, runsData?.items]);
  const runHighlight = useMemo(() => {
    const run = runs.find((item) => item.id === selectedRunId);
    return run
      ? highlightBlocksFromRunSteps(run.steps)
      : { executed: new Set<string>(), failed: new Set<string>() };
  }, [runs, selectedRunId]);

  const clearFlowSelection = () => {
    setSelectedBlockId(null);
    setTriggerPanelOpen(false);
    setDescriptionPanelOpen(false);
    setAddAnchor(null);
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
          onChange={(e) => {
            const trigger = e.target.value as WorkflowDefinition["trigger"];
            commitDefinition({
              ...definition,
              trigger,
              eventName: trigger === "event_match" ? (definition.eventName ?? "") : undefined,
              cron: trigger === "schedule" ? (definition.cron ?? "0 9 * * 1") : undefined,
            });
          }}
          className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
        >
          {TRIGGER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      {definition.trigger === "page_view" ? (
        <section className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-[hsl(var(--foreground))]">Page URL rules</p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Empty rules match every page view.
              </p>
            </div>
            <button
              type="button"
              className="flex h-8 items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 text-xs hover:bg-[hsl(var(--surface-2))]"
              onClick={() => {
                const rules = definition.pageRules ?? [];
                commitDefinition({
                  ...definition,
                  pageRules: [...rules, { urlOp: "contains", url: "/", timeOnPageSec: 0 }],
                });
              }}
            >
              <Plus className="size-3.5" />
              Rule
            </button>
          </div>
          {(definition.pageRules ?? []).map((rule, ruleIndex) => (
            <div
              key={`${rule.urlOp}-${rule.url}-${rule.timeOnPageSec ?? 0}`}
              className="space-y-2 rounded-md bg-[hsl(var(--surface-2))] p-2"
            >
              <div className="flex items-center gap-2">
                <select
                  value={rule.urlOp}
                  onChange={(e) => {
                    const pageRules = [...(definition.pageRules ?? [])];
                    pageRules[ruleIndex] = {
                      ...rule,
                      urlOp: e.target.value as PageRule["urlOp"],
                    };
                    commitDefinition({ ...definition, pageRules });
                  }}
                  className="h-8 w-[118px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-2 text-xs"
                >
                  <option value="contains">contains</option>
                  <option value="eq">equals</option>
                  <option value="matches">matches</option>
                </select>
                <Input
                  value={rule.url}
                  placeholder="/pricing"
                  onChange={(e) => {
                    const pageRules = [...(definition.pageRules ?? [])];
                    pageRules[ruleIndex] = { ...rule, url: e.target.value };
                    commitDefinition({ ...definition, pageRules });
                  }}
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-1))] hover:text-red-400"
                  aria-label="Remove page rule"
                  onClick={() => {
                    const pageRules = (definition.pageRules ?? []).filter(
                      (_, index) => index !== ruleIndex,
                    );
                    commitDefinition({
                      ...definition,
                      pageRules: pageRules.length > 0 ? pageRules : undefined,
                    });
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="block space-y-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                <span>Minimum time on page (seconds)</span>
                <Input
                  type="number"
                  min={0}
                  max={86400}
                  value={rule.timeOnPageSec ?? 0}
                  onChange={(e) => {
                    const pageRules = [...(definition.pageRules ?? [])];
                    pageRules[ruleIndex] = {
                      ...rule,
                      timeOnPageSec: Number.parseInt(e.target.value, 10) || 0,
                    };
                    commitDefinition({ ...definition, pageRules });
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {definition.trigger === "customer_unresponsive" ||
      definition.trigger === "teammate_unresponsive" ? (
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
              commitDefinition({
                ...definition,
                inactivityMinutes: Number.parseInt(e.target.value, 10) || 0,
              })
            }
          />
        </section>
      ) : null}

      {definition.trigger === "event_match" ? (
        <section className="space-y-2">
          <label
            htmlFor="workflow-event-name"
            className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Event name
          </label>
          <Input
            id="workflow-event-name"
            value={definition.eventName ?? ""}
            placeholder="app/subscription.churned"
            onChange={(e) =>
              commitDefinition({
                ...definition,
                eventName: e.target.value,
              })
            }
          />
        </section>
      ) : null}

      {definition.trigger === "schedule" ? (
        <>
          <section className="space-y-2">
            <label
              htmlFor="workflow-cron"
              className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
            >
              Cron
            </label>
            <Input
              id="workflow-cron"
              value={definition.cron ?? ""}
              placeholder="0 9 * * 1"
              onChange={(e) =>
                commitDefinition({
                  ...definition,
                  cron: e.target.value,
                })
              }
            />
          </section>
          <section className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-[hsl(var(--foreground))]">Audience</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Empty rules match every open conversation.
                </p>
              </div>
              <button
                type="button"
                className="flex h-8 items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 text-xs hover:bg-[hsl(var(--surface-2))]"
                onClick={() => {
                  const audience = definition.audience ?? { match: "all", rules: [] };
                  commitDefinition({
                    ...definition,
                    audience: {
                      match: audience.match ?? "all",
                      rules: [
                        ...(audience.rules ?? []),
                        { field: "channelType", op: "eq", value: "messenger" },
                      ],
                    },
                  });
                }}
              >
                <Plus className="size-3.5" />
                Rule
              </button>
            </div>
            <select
              value={definition.audience?.match ?? "all"}
              onChange={(e) =>
                commitDefinition({
                  ...definition,
                  audience: {
                    match: e.target.value as "all" | "any",
                    rules: definition.audience?.rules ?? [],
                  },
                })
              }
              className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs"
            >
              <option value="all">Match all rules</option>
              <option value="any">Match any rule</option>
            </select>
            {(definition.audience?.rules ?? []).map((rule, ruleIndex) => (
              <div
                key={`${rule.field}-${rule.op}-${String(rule.value ?? "")}`}
                className="space-y-2 rounded-md bg-[hsl(var(--surface-2))] p-2"
              >
                <div className="grid grid-cols-[1fr_112px] gap-2">
                  <input
                    list="workflow-audience-fields"
                    value={rule.field}
                    placeholder="channelType"
                    onChange={(e) => {
                      const rules = [...(definition.audience?.rules ?? [])];
                      rules[ruleIndex] = { ...rule, field: e.target.value };
                      commitDefinition({
                        ...definition,
                        audience: { match: definition.audience?.match ?? "all", rules },
                      });
                    }}
                    className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-2 text-xs"
                  />
                  <select
                    value={rule.op}
                    onChange={(e) => {
                      const rules = [...(definition.audience?.rules ?? [])];
                      rules[ruleIndex] = { ...rule, op: e.target.value };
                      commitDefinition({
                        ...definition,
                        audience: { match: definition.audience?.match ?? "all", rules },
                      });
                    }}
                    className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-2 text-xs"
                  >
                    {AUDIENCE_OP_OPTIONS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={String(rule.value ?? "")}
                    placeholder="messenger"
                    disabled={rule.op === "exists"}
                    onChange={(e) => {
                      const rules = [...(definition.audience?.rules ?? [])];
                      rules[ruleIndex] = { ...rule, value: e.target.value };
                      commitDefinition({
                        ...definition,
                        audience: { match: definition.audience?.match ?? "all", rules },
                      });
                    }}
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-1))] hover:text-red-400"
                    aria-label="Remove audience rule"
                    onClick={() => {
                      const rules = (definition.audience?.rules ?? []).filter(
                        (_, index) => index !== ruleIndex,
                      );
                      commitDefinition({
                        ...definition,
                        audience:
                          rules.length > 0
                            ? { match: definition.audience?.match ?? "all", rules }
                            : undefined,
                      });
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <datalist id="workflow-audience-fields">
              {AUDIENCE_FIELD_OPTIONS.map((field) => (
                <option key={field} value={field} />
              ))}
            </datalist>
          </section>
        </>
      ) : null}
    </>
  ) : null;

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <main className="w-full flex-1 overflow-hidden p-4">
        {isLoading || !definition ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <WorkflowFlowCanvas
            definition={definition}
            selectedBlockId={selectedBlockId}
            triggerSelected={triggerPanelOpen}
            runHighlight={runHighlight}
            onSelectBlock={(blockId) => {
              setSelectedBlockId(blockId);
              setTriggerPanelOpen(false);
              setDescriptionPanelOpen(false);
              setAddAnchor(null);
            }}
            onSelectTrigger={() => {
              setTriggerPanelOpen(true);
              setSelectedBlockId(null);
              setDescriptionPanelOpen(false);
              setAddAnchor(null);
            }}
            activeAddAnchor={addAnchor}
            onOpenAddMenu={(anchor) => {
              setAddAnchor(anchor);
              setSelectedBlockId(null);
              setTriggerPanelOpen(false);
              setDescriptionPanelOpen(false);
            }}
            renderAddMenu={(anchor) => (
              <WorkflowActionMenu
                title={workflowAddMenuTitle(anchor)}
                description={workflowAddMenuDescription(anchor)}
                onAdd={(block) => insertBlock(block, anchor)}
              />
            )}
            toolbar={
              <CanvasToolbar
                workflow={workflow}
                name={name}
                onNameChange={setName}
                definition={definition}
                descriptionOpen={descriptionPanelOpen}
                onDescriptionOpen={() => {
                  setDescriptionPanelOpen(true);
                  setSelectedBlockId(null);
                  setTriggerPanelOpen(false);
                  setAddAnchor(null);
                }}
                onAddBlock={(block) => insertBlock(block)}
                onSave={() => save.mutate()}
                onSaveAndPublish={() => {
                  save.mutate(undefined, {
                    onSuccess: () => publish.mutate(),
                  });
                }}
                manageOpen={manageOpen}
                onManageOpenChange={setManageOpen}
                versions={versionsData?.items ?? []}
                onUnpublish={() => unpublish.mutate()}
                onDuplicate={() => duplicate.mutate()}
                onArchive={() => archive.mutate()}
                onRollback={(version) => rollback.mutate(version)}
                onTest={() => {
                  save.mutate(undefined, {
                    onSuccess: () => testRun.mutate(),
                  });
                }}
                onSample={() => {
                  save.mutate(undefined, {
                    onSuccess: () => shadowRun.mutate(),
                  });
                }}
                savePending={save.isPending}
                publishPending={publish.isPending}
                testPending={testRun.isPending}
                samplePending={shadowRun.isPending}
                archivePending={archive.isPending}
                managePending={
                  unpublish.isPending ||
                  duplicate.isPending ||
                  archive.isPending ||
                  rollback.isPending
                }
                canSave={Boolean(definition)}
              />
            }
            configurationPanel={
              selectedBlock && selectedIndex >= 0 ? (
                <CanvasConfigPanel
                  title={selectedBlock.type.replaceAll("_", " ")}
                  onClose={clearFlowSelection}
                >
                  <WorkflowBlockEditor
                    block={selectedBlock}
                    index={selectedIndex}
                    allBlocks={definition.blocks}
                    onChange={updateBlock}
                    onRemove={() => {
                      if (definition.blocks.length <= 1) return;
                      commitDefinition({
                        ...definition,
                        blocks: definition.blocks.filter((b) => b.id !== selectedBlock.id),
                      });
                      setSelectedBlockId(null);
                      setAddAnchor(null);
                    }}
                  />
                </CanvasConfigPanel>
              ) : triggerPanelOpen ? (
                <CanvasConfigPanel title="Trigger action" onClose={clearFlowSelection}>
                  <div className="space-y-4">{triggerFields}</div>
                </CanvasConfigPanel>
              ) : descriptionPanelOpen ? (
                <CanvasConfigPanel title="Description" onClose={clearFlowSelection}>
                  <section className="space-y-2">
                    <label
                      htmlFor="workflow-description"
                      className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                    >
                      Workflow description
                    </label>
                    <textarea
                      id="workflow-description"
                      value={definition.description ?? ""}
                      onChange={(event) =>
                        commitDefinition({
                          ...definition,
                          description: event.target.value.trim() ? event.target.value : undefined,
                        })
                      }
                      rows={6}
                      maxLength={2000}
                      placeholder="Add internal notes about what this workflow does and when it should be used."
                      className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm outline-none"
                    />
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                      Saved with the workflow draft and included in published versions.
                    </p>
                  </section>
                </CanvasConfigPanel>
              ) : null
            }
            runTracePanel={
              selectedBlock || triggerPanelOpen || descriptionPanelOpen ? undefined : (
                <WorkflowRunTrace
                  runs={runs}
                  selectedRunId={selectedRunId}
                  onSelectRun={setSelectedRunId}
                />
              )
            }
            layoutStorageKey={`keenai-workflow-canvas-layout:${workflowId}`}
            canUndo={definitionHistory.past.length > 0}
            canRedo={definitionHistory.future.length > 0}
            onUndo={undoDefinition}
            onRedo={redoDefinition}
          />
        )}
      </main>
    </div>
  );
}

function CanvasToolbar({
  workflow,
  name,
  onNameChange,
  definition,
  descriptionOpen,
  onDescriptionOpen,
  onAddBlock,
  onSave,
  onSaveAndPublish,
  onTest,
  onSample,
  manageOpen,
  onManageOpenChange,
  versions,
  onUnpublish,
  onDuplicate,
  onArchive,
  onRollback,
  savePending,
  publishPending,
  testPending,
  samplePending,
  archivePending,
  managePending,
  canSave,
}: {
  workflow: Workflow | undefined;
  name: string;
  onNameChange: (name: string) => void;
  definition: WorkflowDefinition;
  descriptionOpen: boolean;
  onDescriptionOpen: () => void;
  onAddBlock: (block: WorkflowBlock) => void;
  onSave: () => void;
  onSaveAndPublish: () => void;
  onTest: () => void;
  onSample: () => void;
  manageOpen: boolean;
  onManageOpenChange: (open: boolean) => void;
  versions: WorkflowVersion[];
  onUnpublish: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRollback: (version: number) => void;
  savePending: boolean;
  publishPending: boolean;
  testPending: boolean;
  samplePending: boolean;
  archivePending: boolean;
  managePending: boolean;
  canSave: boolean;
}) {
  const changed =
    workflow?.publishedDefinition &&
    JSON.stringify(workflow.publishedDefinition) !== JSON.stringify(definition);

  return (
    <div className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1)/0.96)] px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href="/workflows"
              className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
              aria-label="Back to workflows"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <Input
              aria-label="Workflow name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="h-9 max-w-[420px] min-w-[220px] flex-1 font-semibold"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDescriptionOpen}
              className={descriptionOpen ? "border-[hsl(var(--primary))]" : ""}
            >
              <PencilLine className="size-4" />
              Description
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className="font-medium text-[hsl(var(--foreground))]">Workflows</span>
            <span className="text-[hsl(var(--muted-foreground))]">/</span>
            <span className="max-w-[260px] truncate font-medium text-[hsl(var(--foreground))]">
              {name || "Untitled workflow"}
            </span>
            <span className="rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 capitalize">
              {workflow?.status ?? "draft"}
            </span>
            <span>
              {definition.blocks.length} step{definition.blocks.length === 1 ? "" : "s"}
            </span>
            {definition.description?.trim() ? <span>Description added</span> : null}
            {changed ? <span>Published snapshot differs from draft</span> : null}
            {workflow?.updatedAt ? (
              <span>Updated {new Date(workflow.updatedAt).toLocaleString()}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <BlockAddMenu onAdd={onAddBlock} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savePending || testPending || samplePending || !canSave}
            onClick={onTest}
          >
            {testPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <TestTube2 className="size-4" />
            )}
            Test
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savePending || testPending || samplePending || !canSave}
            onClick={onSample}
          >
            {samplePending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bot className="size-4" />
            )}
            Sample
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={archivePending || managePending}
            onClick={() => {
              if (window.confirm("Archive this workflow? It will be removed from the list.")) {
                onArchive();
              }
            }}
          >
            {archivePending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savePending || !canSave}
            onClick={onSave}
          >
            {savePending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
          {workflow?.status === "draft" ? (
            <Button
              type="button"
              size="sm"
              disabled={publishPending || savePending || !canSave}
              onClick={onSaveAndPublish}
            >
              {publishPending ? <Loader2 className="size-4 animate-spin" /> : "Save & publish"}
            </Button>
          ) : null}
          <WorkflowManageMenu
            open={manageOpen}
            onOpenChange={onManageOpenChange}
            workflow={workflow}
            versions={versions}
            pending={managePending}
            onUnpublish={onUnpublish}
            onDuplicate={onDuplicate}
            onArchive={onArchive}
            onRollback={onRollback}
          />
        </div>
      </div>
    </div>
  );
}

function WorkflowManageMenu({
  open,
  onOpenChange,
  workflow,
  versions,
  pending,
  onUnpublish,
  onDuplicate,
  onArchive,
  onRollback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | undefined;
  versions: WorkflowVersion[];
  pending: boolean;
  onUnpublish: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRollback: (version: number) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        aria-label="Manage workflow"
        onClick={() => onOpenChange(!open)}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal className="size-4" />
        )}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[320px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-2xl shadow-black/30">
          <div className="border-b border-[hsl(var(--border))] px-3 py-2">
            <p className="text-xs font-semibold text-[hsl(var(--foreground))]">Manage workflow</p>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Version and lifecycle controls stay inside the builder canvas.
            </p>
          </div>
          <div className="space-y-1 p-2">
            {workflow?.status === "published" ? (
              <button
                type="button"
                disabled={pending}
                onClick={onUnpublish}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-[hsl(var(--surface-2))] disabled:opacity-50"
              >
                <RotateCcw className="size-3.5 text-[hsl(var(--muted-foreground))]" />
                Unpublish to draft
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={onDuplicate}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-[hsl(var(--surface-2))] disabled:opacity-50"
            >
              <Copy className="size-3.5 text-[hsl(var(--muted-foreground))]" />
              Duplicate workflow
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Archive this workflow? It will be removed from the list.")) {
                  onArchive();
                }
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              Archive workflow
            </button>
          </div>
          <div className="border-t border-[hsl(var(--border))] p-2">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Published versions
            </p>
            {versions.length > 0 ? (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {versions.slice(0, 8).map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    disabled={pending}
                    onClick={() => onRollback(version.version)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-[hsl(var(--surface-2))] disabled:opacity-50"
                  >
                    <span className="font-medium">Version {version.version}</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      {new Date(version.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-2 pb-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                Publish this workflow to create rollback versions.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CanvasConfigPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex max-h-[calc(100vh-252px)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
            Canvas settings
          </p>
          <h2 className="text-sm font-semibold capitalize">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          aria-label="Close settings"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </section>
  );
}

type WorkflowBlockType = WorkflowBlock["type"];

type BlockAction = {
  type: WorkflowBlockType;
  label: string;
  description: string;
  icon: typeof Plus;
};

const ACTION_GROUP_STYLES: Record<string, string> = {
  Send: "bg-sky-500/10 text-sky-300",
  Collect: "bg-violet-500/10 text-violet-300",
  Internal: "bg-emerald-500/10 text-emerald-300",
  Delay: "bg-amber-500/10 text-amber-300",
  Branch: "bg-orange-500/10 text-orange-300",
  Integrations: "bg-cyan-500/10 text-cyan-300",
};

type PageRule = NonNullable<WorkflowDefinition["pageRules"]>[number];
type AudienceRule = NonNullable<NonNullable<WorkflowDefinition["audience"]>["rules"]>[number];

const AUDIENCE_FIELD_OPTIONS = [
  "channelType",
  "conversationStatus",
  "priority",
  "brandId",
  "userId",
  "tags",
  "attributes.plan",
] as const;

const AUDIENCE_OP_OPTIONS = [
  "eq",
  "ne",
  "contains",
  "starts_with",
  "ends_with",
  "matches",
  "exists",
  "in",
  "nin",
] as const;

const ACTION_GROUPS: { title: string; items: BlockAction[] }[] = [
  {
    title: "Send",
    items: [
      {
        type: "let_keeni_answer",
        label: "Let Keeni answer",
        description: "Use the AI agent, memory, and KB to reply.",
        icon: Bot,
      },
      {
        type: "send_message",
        label: "Message",
        description: "Send a formatted customer message.",
        icon: MessageSquareText,
      },
      {
        type: "show_expected_reply_time",
        label: "Expected reply time",
        description: "Display the SLA reply-time estimate.",
        icon: Clock3,
      },
      {
        type: "disable_customer_reply",
        label: "Disable customer reply",
        description: "Toggle customer replies for this conversation.",
        icon: MessageSquareText,
      },
      {
        type: "send_ticket_update",
        label: "Send ticket update",
        description: "Notify the customer about ticket progress.",
        icon: Ticket,
      },
      {
        type: "send_ticket_form",
        label: "Send ticket form",
        description: "Collect ticket details through a form.",
        icon: FileInput,
      },
    ],
  },
  {
    title: "Collect",
    items: [
      {
        type: "collect_data",
        label: "Collect data",
        description: "Ask for structured fields and wait.",
        icon: FileInput,
      },
      {
        type: "collect_customer_reply",
        label: "Collect customer reply",
        description: "Suspend until the customer responds.",
        icon: MessageSquareText,
      },
      {
        type: "reply_buttons",
        label: "Reply buttons",
        description: "Offer button choices with routing.",
        icon: Send,
      },
      {
        type: "csat",
        label: "Ask for CSAT",
        description: "Request a conversation rating.",
        icon: Star,
      },
    ],
  },
  {
    title: "Internal",
    items: [
      {
        type: "assign",
        label: "Assign",
        description: "Assign directly, round-robin, or least-busy.",
        icon: UserCheck,
      },
      {
        type: "add_note",
        label: "Add note",
        description: "Leave an internal teammate note.",
        icon: PencilLine,
      },
      {
        type: "mark_priority",
        label: "Mark as priority",
        description: "Set low, normal, high, or urgent priority.",
        icon: Star,
      },
      {
        type: "tag_conversation",
        label: "Tag conversation",
        description: "Append or replace conversation tags.",
        icon: Tag,
      },
      {
        type: "tag_end_user",
        label: "Tag end user",
        description: "Append or replace customer tags.",
        icon: Tag,
      },
      {
        type: "set_ticket_state",
        label: "Set ticket state",
        description: "Move the linked ticket to a status.",
        icon: Ticket,
      },
      {
        type: "convert_to_ticket",
        label: "Convert to ticket",
        description: "Create a ticket from the conversation.",
        icon: Ticket,
      },
      {
        type: "link_ticket",
        label: "Link tickets",
        description: "Create parent, child, or tracking links.",
        icon: Ticket,
      },
      {
        type: "apply_sla",
        label: "Apply SLA",
        description: "Apply the active SLA policy.",
        icon: Clock3,
      },
      {
        type: "close",
        label: "Close conversation",
        description: "Close the conversation.",
        icon: X,
      },
      {
        type: "reopen",
        label: "Reopen conversation",
        description: "Reopen a closed or snoozed conversation.",
        icon: Plus,
      },
    ],
  },
  {
    title: "Delay",
    items: [
      {
        type: "snooze",
        label: "Snooze",
        description: "Snooze the conversation for a duration.",
        icon: Clock3,
      },
      {
        type: "wait",
        label: "Wait",
        description: "Pause the workflow before continuing.",
        icon: Clock3,
      },
    ],
  },
  {
    title: "Branch",
    items: [
      {
        type: "branches",
        label: "Branches",
        description: "Route to the first matching branch.",
        icon: GitBranch,
      },
      {
        type: "apply_rules",
        label: "Apply rules",
        description: "Run every matching rule branch.",
        icon: GitBranch,
      },
      {
        type: "goto",
        label: "Go to block",
        description: "Jump to another block.",
        icon: GitBranch,
      },
      {
        type: "end",
        label: "End path",
        description: "Stop this workflow path.",
        icon: X,
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        type: "http_request",
        label: "HTTP request",
        description: "Call an external HTTP endpoint.",
        icon: Globe2,
      },
      {
        type: "webhook_emit",
        label: "Emit webhook",
        description: "Send a workflow event to a webhook.",
        icon: Webhook,
      },
      {
        type: "mcp_call",
        label: "MCP call",
        description: "Call a configured MCP tool.",
        icon: Braces,
      },
      {
        type: "script",
        label: "Script",
        description: "Run a constrained JavaScript block.",
        icon: Braces,
      },
    ],
  },
];

function BlockAddMenu({ onAdd }: { onAdd: (block: WorkflowBlock) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--primary)/0.9)]"
      >
        <Plus className="size-3.5" />
        Add
        <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <WorkflowActionMenu
          className="absolute top-11 right-0 z-50"
          onAdd={(block) => {
            onAdd(block);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function WorkflowActionMenu({
  onAdd,
  title = "Add action",
  description = "Choose the next workflow component. Settings open on the canvas after selection.",
  className,
}: {
  onAdd: (block: WorkflowBlock) => void;
  title?: string;
  description?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!normalizedQuery) return ACTION_GROUPS;
    return ACTION_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [group.title, item.label, item.description, item.type]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    })).filter((group) => group.items.length > 0);
  }, [normalizedQuery]);

  return (
    <div
      className={cn(
        "w-[380px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-2xl shadow-black/30",
        className,
      )}
    >
      <div className="border-b border-[hsl(var(--border))] px-4 py-3">
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      <label className="flex h-12 items-center gap-2 border-b border-[hsl(var(--border))] px-4 text-sm text-[hsl(var(--muted-foreground))]">
        <Search className="size-4 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search actions..."
          className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
        />
      </label>
      <div className="max-h-[520px] overflow-y-auto">
        {groups.length > 0 ? (
          groups.map((group) => (
            <section
              key={group.title}
              className="border-b border-[hsl(var(--border))] last:border-b-0"
            >
              <p className="bg-[hsl(var(--surface-2))] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {group.title}
              </p>
              <div className="p-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => onAdd(createWorkflowBlock(item.type))}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--surface-2))]"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md",
                          ACTION_GROUP_STYLES[group.title] ?? "bg-violet-500/10 text-violet-300",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                          {item.label}
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">No actions found</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Try searching for send, collect, branch, internal, or integration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function createWorkflowBlock(type: WorkflowBlockType): WorkflowBlock {
  const id = newBlockId();
  switch (type) {
    case "send_message":
      return { id, type, plainText: "Hello!" };
    case "show_expected_reply_time":
      return { id, type, fallbackMinutes: 240 };
    case "add_note":
      return { id, type, plainText: "Internal note" };
    case "mark_priority":
      return { id, type, priority: "high" };
    case "assign":
      return { id, type, assigneeId: null, teamId: null, strategy: "direct" };
    case "close":
    case "reopen":
    case "end":
      return { id, type };
    case "goto":
      return { id, type, targetBlockId: "" };
    case "let_keeni_answer":
      return { id, type, maxSteps: 8, instructions: "" };
    case "wait":
      return { id, type, seconds: 60 };
    case "http_request":
      return { id, type, method: "GET", url: "https://example.com/hook" };
    case "webhook_emit":
      return {
        id,
        type,
        url: "https://example.com/webhook",
        eventName: "workflow.event",
        payload: "{}",
      };
    case "mcp_call":
      return {
        id,
        type,
        serverId: "stub",
        toolName: "echo",
        arguments: { message: "hello" },
      };
    case "script":
      return {
        id,
        type,
        code: 'return { channel: facts.channelType, priority: facts.priority ?? "normal" };',
        timeoutMs: 2000,
        memoryMb: 32,
      };
    case "branches":
      return {
        id,
        type,
        branches: [
          {
            label: "Email channel",
            condition: { field: "channelType", op: "eq", value: "email" },
            nextId: null,
          },
          { label: "Default", nextId: null },
        ],
      };
    case "apply_rules":
      return {
        id,
        type,
        rules: [
          {
            label: "Messenger",
            condition: { field: "channelType", op: "eq", value: "messenger" },
            nextId: `next-${id}`,
          },
        ],
      };
    case "apply_sla":
      return { id, type };
    case "convert_to_ticket":
      return { id, type, title: "" };
    case "link_ticket":
      return { id, type, childTicketId: "", linkType: "tracks" };
    case "send_ticket_update":
      return { id, type };
    case "send_ticket_form":
      return {
        id,
        type,
        prompt: "Please share the details we need for this ticket.",
        fields: [{ key: "impact", label: "Impact", type: "text", required: true }],
      };
    case "collect_data":
      return {
        id,
        type,
        prompt: "What is your email?",
        allowFreeText: false,
        fields: [{ key: "email", label: "Email", required: true }],
      };
    case "collect_customer_reply":
      return {
        id,
        type,
        prompt: "Reply here when you are ready.",
        bufferSeconds: 2,
      };
    case "reply_buttons":
      return {
        id,
        type,
        prompt: "How can we help?",
        allowFreeText: false,
        buttons: [
          { id: "sales", label: "Sales", nextId: null },
          { id: "support", label: "Support", nextId: null },
        ],
      };
    case "disable_customer_reply":
      return { id, type, disabled: true };
    case "snooze":
      return { id, type, minutes: 60 };
    case "tag_end_user":
      return { id, type, tags: ["vip"], mode: "append" };
    case "tag_conversation":
      return { id, type, tags: ["vip"], mode: "append" };
    case "set_ticket_state":
      return { id, type, statusName: "Done" };
    case "csat":
      return {
        id,
        type,
        prompt: "How would you rate this conversation?",
        allowComment: true,
        waitForRating: false,
      };
  }
}
