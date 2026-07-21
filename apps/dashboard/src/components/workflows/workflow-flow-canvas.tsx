"use client";

import type { WorkflowBlock, WorkflowDefinition } from "@/lib/api";
import { cn } from "@keenai/ui";
import {
  Background,
  BaseEdge,
  type Edge,
  type EdgeProps,
  Handle,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileInput,
  GitBranch,
  LayoutGrid,
  Maximize2,
  MessageSquareText,
  Minus,
  Plus,
  Redo2,
  Send,
  Tag,
  Ticket,
  Trash2,
  Undo2,
  UserCheck,
  Zap,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  blockCategory,
  blockLabel,
  collectWorkflowEdges,
  layoutWorkflowNodes,
  triggerLabel,
  workflowNodeSize,
} from "./workflow-graph";

type BlockNodeData = {
  block: WorkflowBlock;
  selected: boolean;
  executed: boolean;
  failed: boolean;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeBlock: (block: WorkflowBlock) => void;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
};

type TriggerNodeData = {
  trigger: WorkflowDefinition["trigger"];
  definition: WorkflowDefinition;
  selected: boolean;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
};

type ManualPositionMap = Record<string, { x: number; y: number }>;

export type WorkflowCanvasInsertAnchor =
  | { kind: "trigger" }
  | { kind: "block"; blockId: string }
  | { kind: "branch"; blockId: string; branchIndex: number }
  | { kind: "branch_else"; blockId: string }
  | { kind: "rule"; blockId: string; ruleIndex: number }
  | { kind: "button"; blockId: string; buttonId: string }
  | { kind: "outcome"; blockId: string; outcome: "resolved" | "unresolved" | "escalated" };

function insertAnchorKey(anchor: WorkflowCanvasInsertAnchor): string {
  switch (anchor.kind) {
    case "trigger":
      return "trigger";
    case "block":
      return `block:${anchor.blockId}`;
    case "branch":
      return `branch:${anchor.blockId}:${anchor.branchIndex}`;
    case "branch_else":
      return `branch_else:${anchor.blockId}`;
    case "rule":
      return `rule:${anchor.blockId}:${anchor.ruleIndex}`;
    case "button":
      return `button:${anchor.blockId}:${anchor.buttonId}`;
    case "outcome":
      return `outcome:${anchor.blockId}:${anchor.outcome}`;
  }
}

function sameInsertAnchor(
  left: WorkflowCanvasInsertAnchor | null,
  right: WorkflowCanvasInsertAnchor,
) {
  if (!left) return false;
  return insertAnchorKey(left) === insertAnchorKey(right);
}

const categoryStyles: Record<
  ReturnType<typeof blockCategory> | "trigger",
  { border: string; badge: string; wash: string; icon: string }
> = {
  trigger: {
    border: "border-violet-500/60",
    badge: "text-violet-400",
    wash: "bg-violet-500/10",
    icon: "text-violet-400",
  },
  message: {
    border: "border-violet-500/55",
    badge: "text-violet-300",
    wash: "bg-violet-500/10",
    icon: "text-violet-300",
  },
  condition: {
    border: "border-amber-500/50",
    badge: "text-amber-400",
    wash: "bg-amber-500/10",
    icon: "text-amber-400",
  },
  action: {
    border: "border-[hsl(var(--border))]",
    badge: "text-[hsl(var(--primary))]",
    wash: "bg-[hsl(var(--surface-2))]",
    icon: "text-[hsl(var(--primary))]",
  },
};

function WorkflowBlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const block = data.block;
  const category = blockCategory(block);
  const styles = categoryStyles[category];
  const addAnchor: WorkflowCanvasInsertAnchor = { kind: "block", blockId: block.id };
  const addMenuOpen = sameInsertAnchor(data.activeAddAnchor, addAnchor);

  return (
    <div
      className={cn(
        "group relative w-[320px] rounded-2xl border bg-[hsl(var(--surface-1))] p-3 shadow-lg shadow-black/10 transition-shadow",
        styles.border,
        data.failed
          ? "ring-2 ring-red-500 ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : data.executed
            ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
            : data.selected
              ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
              : "",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-violet-500 !border-violet-300"
      />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full border border-white/10",
            styles.wash,
            styles.icon,
          )}
        >
          <BlockIcon block={block} />
        </span>
        <div className="min-w-0">
          <p className={cn("text-[10px] font-semibold uppercase tracking-wide", styles.badge)}>
            {block.type.replaceAll("_", " ")}
          </p>
          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
            {workflowBlockTitle(block)}
          </p>
        </div>
        {data.failed ? (
          <CircleAlert className="ml-auto size-4 text-red-400" />
        ) : data.executed ? (
          <CheckCircle2 className="ml-auto size-4 text-emerald-400" />
        ) : null}
      </div>

      <BlockPreview
        block={block}
        activeAddAnchor={data.activeAddAnchor}
        onChangeBlock={data.onChangeBlock}
        onOpenAddMenu={data.onOpenAddMenu}
        renderAddMenu={data.renderAddMenu}
      />

      <div className="mt-3 border-t border-[hsl(var(--border))] pt-3">
        <button
          type="button"
          className={cn(
            "nodrag nopan flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-100",
            addMenuOpen ? "border-violet-400/60 bg-violet-500/15 text-violet-100" : "",
          )}
          aria-label={`Add step after ${workflowBlockTitle(block)}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onOpenAddMenu(addMenuOpen ? null : addAnchor);
          }}
        >
          <Plus className="size-3.5" />
          Add step
        </button>
      </div>

      <button
        type="button"
        className={cn(
          "nodrag nopan absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-[hsl(var(--surface-0))] text-violet-300 shadow transition-colors group-hover:flex hover:bg-violet-500/15",
          addMenuOpen ? "flex" : "",
        )}
        aria-label={`Add action after ${workflowBlockTitle(block)}`}
        onClick={(event) => {
          event.stopPropagation();
          data.onOpenAddMenu(addMenuOpen ? null : addAnchor);
        }}
      >
        <Plus className="size-3.5" />
      </button>
      {addMenuOpen && data.renderAddMenu ? (
        <div
          className="nodrag nopan absolute left-[calc(100%+1rem)] top-8 z-50"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {data.renderAddMenu(addAnchor)}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !border-violet-300"
      />
    </div>
  );
}

function WorkflowTriggerNode({ data }: NodeProps<Node<TriggerNodeData>>) {
  const styles = categoryStyles.trigger;
  const label = triggerLabel(data.trigger);
  const addAnchor: WorkflowCanvasInsertAnchor = { kind: "trigger" };
  const addMenuOpen = sameInsertAnchor(data.activeAddAnchor, addAnchor);
  const detailGroups = triggerDetailGroups(data.definition);

  return (
    <div
      className={cn(
        "group relative w-[320px] rounded-2xl border bg-[hsl(var(--surface-1))] p-3 shadow-lg shadow-black/10",
        styles.border,
        data.selected
          ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : "",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-300">
          <Zap className="size-4" />
        </span>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
            Trigger action
          </p>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {triggerPreviewTitle(data.trigger)}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
          {triggerPreviewDescription(data.trigger)}
        </p>
        <div className="mt-3 space-y-2">
          <TriggerChipGroup label="Trigger" values={[label]} accent />
          {detailGroups.map((group) => (
            <TriggerChipGroup key={group.label} label={group.label} values={group.values} />
          ))}
        </div>
      </div>
      <button
        type="button"
        className={cn(
          "nodrag nopan absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-[hsl(var(--surface-0))] text-violet-300 shadow transition-colors hover:bg-violet-500/15",
          addMenuOpen ? "flex" : "group-hover:flex",
        )}
        aria-label="Add first workflow action"
        onClick={(event) => {
          event.stopPropagation();
          data.onOpenAddMenu(addMenuOpen ? null : addAnchor);
        }}
      >
        <Plus className="size-3.5" />
      </button>
      {addMenuOpen && data.renderAddMenu ? (
        <div
          className="nodrag nopan absolute left-[calc(100%+1rem)] top-8 z-50"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {data.renderAddMenu(addAnchor)}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !border-violet-300"
      />
    </div>
  );
}

function TriggerChipGroup({
  label,
  values,
  accent = false,
}: {
  label: string;
  values: string[];
  accent?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className={cn(
              "max-w-full truncate rounded-full px-2 py-1 text-[10px] font-medium",
              accent
                ? "bg-violet-500/15 text-violet-200"
                : "bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))]",
            )}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function triggerDetailGroups(
  definition: WorkflowDefinition,
): { label: string; values: string[] }[] {
  switch (definition.trigger) {
    case "page_view":
      return [
        { label: "Channels", values: ["Web"] },
        {
          label: "Page rules",
          values:
            definition.pageRules && definition.pageRules.length > 0
              ? definition.pageRules
                  .slice(0, 2)
                  .map(
                    (rule) =>
                      `${rule.urlOp === "eq" ? "equals" : rule.urlOp} ${rule.url}${
                        rule.timeOnPageSec ? ` · ${rule.timeOnPageSec}s` : ""
                      }`,
                  )
              : ["Any page"],
        },
        { label: "Audience", values: ["Users", "Leads & Visitors"] },
      ];
    case "schedule":
      return [
        { label: "Schedule", values: [definition.cron ?? "No cron set"] },
        {
          label: "Audience",
          values: [
            definition.audience?.rules?.length
              ? `${definition.audience.match ?? "all"} · ${definition.audience.rules.length} rule(s)`
              : "All open conversations",
          ],
        },
      ];
    case "webhook":
      return [{ label: "Source", values: ["Webhook"] }];
    case "event_match":
      return [{ label: "Event", values: [definition.eventName ?? "Event name required"] }];
    case "ticket_created":
    case "ticket_state_changed":
      return [{ label: "Channels", values: ["Tickets"] }];
    default:
      return [{ label: "Channels", values: ["Messenger", "Inbox"] }];
  }
}

function miniMapNodeColor(node: Node) {
  if (node.type === "workflowTrigger") return "hsl(270 88% 68%)";
  const data = node.data as Partial<BlockNodeData>;
  if (data.failed) return "hsl(0 84% 60%)";
  if (data.executed) return "hsl(160 84% 39%)";
  if (!data.block) return "hsl(252 80% 70%)";
  switch (blockCategory(data.block)) {
    case "condition":
      return "hsl(38 92% 50%)";
    case "message":
      return "hsl(260 84% 70%)";
    default:
      return "hsl(210 78% 58%)";
  }
}

function BlockIcon({ block }: { block: WorkflowBlock }) {
  switch (block.type) {
    case "send_message":
    case "show_expected_reply_time":
    case "reply_buttons":
    case "collect_customer_reply":
    case "disable_customer_reply":
      return <MessageSquareText className="size-4" />;
    case "let_keeni_answer":
      return <Bot className="size-4" />;
    case "collect_data":
    case "send_ticket_form":
      return <FileInput className="size-4" />;
    case "branches":
    case "apply_rules":
    case "goto":
      return <GitBranch className="size-4" />;
    case "wait":
    case "snooze":
      return <Clock3 className="size-4" />;
    case "assign":
      return <UserCheck className="size-4" />;
    case "convert_to_ticket":
    case "link_ticket":
    case "send_ticket_update":
    case "set_ticket_state":
      return <Ticket className="size-4" />;
    case "tag_conversation":
    case "tag_end_user":
      return <Tag className="size-4" />;
    default:
      return <Send className="size-4" />;
  }
}

function workflowBlockTitle(block: WorkflowBlock): string {
  switch (block.type) {
    case "let_keeni_answer":
      return "Let Keeni answer";
    case "send_message":
      return "Message";
    case "show_expected_reply_time":
      return "Show expected reply time";
    case "collect_data":
      return "Collect data";
    case "collect_customer_reply":
      return "Collect customer reply";
    case "reply_buttons":
      return "Reply buttons";
    case "csat":
      return "Ask for conversation rating";
    case "branches":
      return "Branches";
    case "apply_rules":
      return "Apply rules";
    default:
      return block.type.replaceAll("_", " ");
  }
}

function BlockPreview({
  block,
  activeAddAnchor,
  onChangeBlock,
  onOpenAddMenu,
  renderAddMenu,
}: {
  block: WorkflowBlock;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeBlock: (block: WorkflowBlock) => void;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  if (block.type === "send_message") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Content
        </p>
        <textarea
          value={block.plainText ?? ""}
          rows={4}
          aria-label="Message text"
          placeholder="Write a message for the customer..."
          className="nodrag nopan min-h-[86px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, plainText: event.target.value })}
        />
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          <span className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 font-semibold">
            B
          </span>
          <span className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 italic">I</span>
          <span className="ml-auto">{block.attachmentIds?.length ?? 0} attachments</span>
        </div>
        <input
          value={block.attachmentIds?.join(", ") ?? ""}
          aria-label="Attachment IDs"
          placeholder="Attachment IDs, comma separated"
          className="nodrag nopan mt-2 h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              attachmentIds: event.target.value
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    );
  }

  if (block.type === "let_keeni_answer") {
    const outcomeRouting = block.outcomeRouting;
    return (
      <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-0))] px-3 py-2">
          <Bot className="size-4 text-violet-300" />
          <p className="text-xs font-medium text-[hsl(var(--foreground))]">
            Auto answer with brand memory and knowledge base.
          </p>
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
          {block.instructions?.trim() || `Max ${block.maxSteps ?? 8} agent steps.`}
        </p>
        <RouteOutputs
          routes={[
            {
              label: "Resolved",
              anchor: { kind: "outcome", blockId: block.id, outcome: "resolved" },
              connected: Boolean(outcomeRouting?.resolvedNext),
            },
            {
              label: "Unresolved",
              anchor: { kind: "outcome", blockId: block.id, outcome: "unresolved" },
              connected: Boolean(outcomeRouting?.unresolvedNext),
            },
            {
              label: "Escalated",
              anchor: { kind: "outcome", blockId: block.id, outcome: "escalated" },
              connected: Boolean(outcomeRouting?.escalatedNext),
            },
          ]}
          activeAddAnchor={activeAddAnchor}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      </div>
    );
  }

  if (block.type === "reply_buttons") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <textarea
          value={block.prompt}
          rows={2}
          aria-label="Reply button prompt"
          placeholder="Prompt shown above the buttons"
          className="nodrag nopan min-h-[56px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, prompt: event.target.value })}
        />
        <ReplyButtonOutputs
          block={block}
          activeAddAnchor={activeAddAnchor}
          onChangeBlock={onChangeBlock}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
        <button
          type="button"
          disabled={block.buttons.length >= 8}
          className="nodrag nopan mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => {
            event.stopPropagation();
            const nextIndex = block.buttons.length + 1;
            onChangeBlock({
              ...block,
              buttons: [
                ...block.buttons,
                {
                  id: `option_${Date.now().toString(36)}`,
                  label: `Option ${nextIndex}`,
                  nextId: null,
                },
              ],
            });
          }}
        >
          <Plus className="size-3.5" />
          Add button
        </button>
      </div>
    );
  }

  if (block.type === "branches" || block.type === "apply_rules") {
    return (
      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-xs text-[hsl(var(--foreground))]">{blockLabel(block)}</p>
        <ConditionRouteOutputs
          block={block}
          activeAddAnchor={activeAddAnchor}
          onChangeBlock={onChangeBlock}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      </div>
    );
  }

  if (block.type === "add_note") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <textarea
          value={block.plainText}
          rows={3}
          aria-label="Internal note"
          placeholder="Internal note"
          className="nodrag nopan min-h-[76px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, plainText: event.target.value })}
        />
      </div>
    );
  }

  if (block.type === "assign") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <select
          value={block.strategy ?? "direct"}
          aria-label="Assignment strategy"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              strategy: event.target.value as "direct" | "round_robin" | "least_busy",
            })
          }
        >
          <option value="direct">Direct</option>
          <option value="round_robin">Round robin</option>
          <option value="least_busy">Least busy</option>
        </select>
        <input
          value={block.assigneeId ?? ""}
          aria-label="Assignee member ID"
          placeholder="Assignee member ID"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, assigneeId: event.target.value.trim() || null })
          }
        />
        <input
          value={block.teamId ?? ""}
          aria-label="Team ID"
          placeholder="Team ID"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, teamId: event.target.value.trim() || null })
          }
        />
      </div>
    );
  }

  if (block.type === "wait" || block.type === "snooze") {
    const value = block.type === "wait" ? block.seconds : block.minutes;
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {block.type === "wait" ? "Wait seconds" : "Snooze minutes"}
          <input
            type="number"
            min={1}
            max={block.type === "wait" ? 86400 : 43200}
            value={value}
            aria-label={block.type === "wait" ? "Wait seconds" : "Snooze minutes"}
            className="nodrag nopan h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs font-medium text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              const next = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
              onChangeBlock(
                block.type === "wait" ? { ...block, seconds: next } : { ...block, minutes: next },
              );
            }}
          />
        </label>
      </div>
    );
  }

  if (block.type === "mark_priority") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <select
          value={block.priority}
          aria-label="Priority"
          className="nodrag nopan h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs font-medium text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              priority: event.target.value as "low" | "normal" | "high" | "urgent",
            })
          }
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
    );
  }

  if (block.type === "tag_conversation" || block.type === "tag_end_user") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.tags.join(", ")}
          aria-label={block.type === "tag_conversation" ? "Conversation tags" : "End-user tags"}
          placeholder="Tags, comma separated"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
        <select
          value={block.mode ?? "append"}
          aria-label="Tag mode"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, mode: event.target.value as "append" | "replace" })
          }
        >
          <option value="append">Append</option>
          <option value="replace">Replace</option>
        </select>
      </div>
    );
  }

  if (block.type === "collect_data" || block.type === "send_ticket_form") {
    const fields = block.fields.map((field) => field.label);
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="line-clamp-2 text-xs text-[hsl(var(--foreground))]">
          {block.type === "collect_data" ? block.prompt : block.title || block.prompt}
        </p>
        <div className="mt-3 grid gap-1.5">
          {fields.slice(0, 3).map((field) => (
            <span
              key={field}
              className="rounded-md bg-[hsl(var(--surface-0))] px-2 py-1 text-[11px] text-[hsl(var(--muted-foreground))]"
            >
              {field}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
      <p className="line-clamp-3 min-h-[44px] text-xs text-[hsl(var(--foreground))]">
        {blockLabel(block)}
      </p>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        Click card to edit settings
      </p>
    </div>
  );
}

function ReplyButtonOutputs({
  block,
  activeAddAnchor,
  onChangeBlock,
  onOpenAddMenu,
  renderAddMenu,
}: {
  block: Extract<WorkflowBlock, { type: "reply_buttons" }>;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeBlock: (block: WorkflowBlock) => void;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  return (
    <div className="mt-3 grid gap-1.5">
      {block.buttons.slice(0, 8).map((button, buttonIndex) => {
        const anchor: WorkflowCanvasInsertAnchor = {
          kind: "button",
          blockId: block.id,
          buttonId: button.id,
        };
        const open = sameInsertAnchor(activeAddAnchor, anchor);
        return (
          <div key={button.id} className="relative">
            <div
              className={cn(
                "nodrag nopan flex items-center gap-1.5 rounded-lg border bg-[hsl(var(--surface-0))] px-2 py-1.5 transition-colors",
                button.nextId
                  ? "border-emerald-400/30"
                  : "border-violet-400/30 hover:border-violet-400/60",
                open ? "border-violet-300 bg-violet-500/20" : "",
              )}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                value={button.label}
                aria-label={`Reply button ${buttonIndex + 1} label`}
                className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
                placeholder={`Option ${buttonIndex + 1}`}
                onChange={(event) => {
                  const buttons = [...block.buttons];
                  buttons[buttonIndex] = { ...button, label: event.target.value };
                  onChangeBlock({ ...block, buttons });
                }}
              />
              <button
                type="button"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-violet-500/15 hover:text-violet-100",
                  open ? "bg-violet-500/15 text-violet-100" : "",
                )}
                aria-label={`Add action for ${button.label || `button ${buttonIndex + 1}`}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenAddMenu(open ? null : anchor);
                }}
              >
                {button.nextId ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <Plus className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                disabled={block.buttons.length <= 1}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`Remove ${button.label || `button ${buttonIndex + 1}`}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChangeBlock({
                    ...block,
                    buttons: block.buttons.filter((_, index) => index !== buttonIndex),
                  });
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {open && renderAddMenu ? (
              <div
                className="nodrag nopan absolute left-[calc(100%+0.75rem)] top-0 z-50"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {renderAddMenu(anchor)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ConditionRouteOutputs({
  block,
  activeAddAnchor,
  onChangeBlock,
  onOpenAddMenu,
  renderAddMenu,
}: {
  block: Extract<WorkflowBlock, { type: "branches" | "apply_rules" }>;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeBlock: (block: WorkflowBlock) => void;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  if (block.type === "branches") {
    return (
      <div className="mt-3 grid gap-1.5">
        {block.branches.slice(0, 4).map((branch, branchIndex) => (
          <EditableRouteRow
            key={`${block.id}-branch-${branchIndex}`}
            label={branch.label ?? ""}
            fallbackLabel={`Branch ${branchIndex + 1}`}
            connected={Boolean(branch.nextId)}
            anchor={{ kind: "branch", blockId: block.id, branchIndex }}
            activeAddAnchor={activeAddAnchor}
            onChangeLabel={(label) => {
              const branches = [...block.branches];
              branches[branchIndex] = { ...branch, label };
              onChangeBlock({ ...block, branches });
            }}
            onOpenAddMenu={onOpenAddMenu}
            renderAddMenu={renderAddMenu}
          />
        ))}
        <StaticRouteRow
          label="Else"
          connected={Boolean(block.elseNextId)}
          anchor={{ kind: "branch_else", blockId: block.id }}
          activeAddAnchor={activeAddAnchor}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-1.5">
      {block.rules.slice(0, 4).map((rule, ruleIndex) => (
        <EditableRouteRow
          key={`${block.id}-rule-${ruleIndex}`}
          label={rule.label ?? ""}
          fallbackLabel={`Rule ${ruleIndex + 1}`}
          connected={Boolean(rule.nextId)}
          anchor={{ kind: "rule", blockId: block.id, ruleIndex }}
          activeAddAnchor={activeAddAnchor}
          onChangeLabel={(label) => {
            const rules = [...block.rules];
            rules[ruleIndex] = { ...rule, label };
            onChangeBlock({ ...block, rules });
          }}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      ))}
    </div>
  );
}

function EditableRouteRow({
  label,
  fallbackLabel,
  connected,
  anchor,
  activeAddAnchor,
  onChangeLabel,
  onOpenAddMenu,
  renderAddMenu,
}: {
  label: string;
  fallbackLabel: string;
  connected: boolean;
  anchor: WorkflowCanvasInsertAnchor;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeLabel: (label: string) => void;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  const open = sameInsertAnchor(activeAddAnchor, anchor);
  return (
    <div className="relative">
      <div
        className={cn(
          "nodrag nopan flex items-center gap-1.5 rounded-lg border bg-[hsl(var(--surface-0))] px-2 py-1.5 transition-colors",
          connected ? "border-emerald-400/30" : "border-amber-400/30 hover:border-amber-400/60",
          open ? "border-violet-300 bg-violet-500/20" : "",
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          value={label}
          aria-label={`${fallbackLabel} label`}
          placeholder={fallbackLabel}
          className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          onChange={(event) => onChangeLabel(event.target.value)}
        />
        <button
          type="button"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-violet-500/15 hover:text-violet-100",
            open ? "bg-violet-500/15 text-violet-100" : "",
          )}
          aria-label={`Add action for ${label || fallbackLabel}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenAddMenu(open ? null : anchor);
          }}
        >
          {connected ? <CheckCircle2 className="size-3.5" /> : <Plus className="size-3.5" />}
        </button>
      </div>
      {open && renderAddMenu ? (
        <div
          className="nodrag nopan absolute left-[calc(100%+0.75rem)] top-0 z-50"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {renderAddMenu(anchor)}
        </div>
      ) : null}
    </div>
  );
}

function StaticRouteRow({
  label,
  connected,
  anchor,
  activeAddAnchor,
  onOpenAddMenu,
  renderAddMenu,
}: {
  label: string;
  connected: boolean;
  anchor: WorkflowCanvasInsertAnchor;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  const open = sameInsertAnchor(activeAddAnchor, anchor);
  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "nodrag nopan flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors",
          connected
            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
            : "border-amber-400/30 bg-[hsl(var(--surface-0))] text-amber-100 hover:bg-amber-500/15",
          open ? "border-violet-300 bg-violet-500/20" : "",
        )}
        aria-label={`Add action for ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenAddMenu(open ? null : anchor);
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {connected ? (
          <CheckCircle2 className="size-3.5 shrink-0" />
        ) : (
          <Plus className="size-3.5 shrink-0" />
        )}
      </button>
      {open && renderAddMenu ? (
        <div
          className="nodrag nopan absolute left-[calc(100%+0.75rem)] top-0 z-50"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {renderAddMenu(anchor)}
        </div>
      ) : null}
    </div>
  );
}

function RouteOutputs({
  routes,
  activeAddAnchor,
  onOpenAddMenu,
  renderAddMenu,
}: {
  routes: {
    label: string;
    anchor: WorkflowCanvasInsertAnchor;
    connected: boolean;
  }[];
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  return (
    <div className="mt-3 grid gap-1.5">
      {routes.map((route) => {
        const open = sameInsertAnchor(activeAddAnchor, route.anchor);
        return (
          <div key={insertAnchorKey(route.anchor)} className="relative">
            <button
              type="button"
              className={cn(
                "nodrag nopan flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors",
                route.connected
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                  : "border-violet-400/30 bg-[hsl(var(--surface-0))] text-violet-100 hover:bg-violet-500/15",
                open ? "border-violet-300 bg-violet-500/20" : "",
              )}
              aria-label={`Add action for ${route.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenAddMenu(open ? null : route.anchor);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{route.label}</span>
              {route.connected ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <Plus className="size-3.5 shrink-0" />
              )}
            </button>
            {open && renderAddMenu ? (
              <div
                className="nodrag nopan absolute left-[calc(100%+0.75rem)] top-0 z-50"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {renderAddMenu(route.anchor)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function triggerPreviewTitle(trigger: WorkflowDefinition["trigger"]): string {
  switch (trigger) {
    case "page_view":
      return "Customer visits a page";
    case "new_messenger_conversation":
      return "New messenger conversation";
    case "first_message":
      return "Customer opens a new conversation";
    case "any_message":
      return "Any message is received";
    case "teammate_message":
      return "Teammate sends a message";
    case "conversation_state_changed":
      return "Conversation state changes";
    case "assigned_to_team":
      return "Conversation assigned to team";
    case "assigned_to_member":
      return "Conversation assigned to member";
    case "customer_unresponsive":
      return "Customer becomes unresponsive";
    case "teammate_unresponsive":
      return "Teammate becomes unresponsive";
    case "teammate_added_note":
      return "Teammate adds a note";
    case "ticket_created":
      return "Ticket is created";
    case "ticket_state_changed":
      return "Ticket state changes";
    case "schedule":
      return "Scheduled workflow";
    case "webhook":
      return "Incoming webhook";
    case "event_match":
      return "Custom event matches";
  }
}

function triggerPreviewDescription(trigger: WorkflowDefinition["trigger"]): string {
  switch (trigger) {
    case "page_view":
      return "Runs when a customer page-view event matches URL rules.";
    case "new_messenger_conversation":
      return "Runs when a customer starts a new messenger conversation.";
    case "first_message":
      return "Starts when the first customer message creates a conversation.";
    case "any_message":
      return "Runs whenever a customer or teammate message matches the trigger.";
    case "teammate_message":
      return "Runs when a teammate replies in the conversation.";
    case "conversation_state_changed":
      return "Runs when the conversation changes open, closed, or snoozed state.";
    case "assigned_to_team":
      return "Runs when the conversation is assigned to a team.";
    case "assigned_to_member":
      return "Runs when the conversation is assigned to a teammate.";
    case "customer_unresponsive":
      return "Starts after the configured inactivity window following an agent reply.";
    case "teammate_unresponsive":
      return "Runs after the configured inactivity window following a customer message.";
    case "teammate_added_note":
      return "Runs when a teammate adds an internal note.";
    case "ticket_created":
      return "Runs when a ticket is created from a conversation or form.";
    case "ticket_state_changed":
      return "Runs when a ticket moves between workflow states.";
    case "schedule":
      return "Runs on a cron schedule against the configured audience.";
    case "webhook":
      return "Runs when an external system posts to this workflow.";
    case "event_match":
      return "Runs when an incoming product event name matches this trigger.";
  }
}

function PurpleWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: "hsl(262 83% 58%)",
          strokeWidth: data?.kind === "branch" || data?.kind === "outcome" ? 2 : 1.5,
        }}
      />
      {label ? (
        <text
          x={labelX}
          y={labelY}
          className="fill-[hsl(var(--muted-foreground))] text-[10px]"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {label}
        </text>
      ) : null}
    </>
  );
}

const nodeTypes = {
  workflowBlock: WorkflowBlockNode,
  workflowTrigger: WorkflowTriggerNode,
};

const edgeTypes = {
  purple: PurpleWorkflowEdge,
};

function definitionToFlow(
  definition: WorkflowDefinition,
  selectedBlockId: string | null,
  triggerSelected: boolean,
  runHighlight: { executed: Set<string>; failed: Set<string> },
  activeAddAnchor: WorkflowCanvasInsertAnchor | null,
  onChangeBlock: (block: WorkflowBlock) => void,
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void,
  renderAddMenu: ((anchor: WorkflowCanvasInsertAnchor) => ReactNode) | undefined,
  manualPositions: ManualPositionMap,
): { nodes: Node[]; edges: Edge[] } {
  const graphEdges = collectWorkflowEdges(definition);
  const layoutInput = [
    {
      id: "__trigger__",
      width: workflowNodeSize.trigger.width,
      height: workflowNodeSize.trigger.height,
    },
    ...definition.blocks.map((block) => ({
      id: block.id,
      width: workflowNodeSize.block.width,
      height: workflowNodeSize.block.height,
    })),
  ];

  const positioned = layoutWorkflowNodes(layoutInput, graphEdges);

  const nodes: Node[] = [
    {
      id: "__trigger__",
      type: "workflowTrigger",
      position: manualPositions.__trigger__ ?? {
        x: positioned.find((n) => n.id === "__trigger__")?.x ?? 0,
        y: positioned.find((n) => n.id === "__trigger__")?.y ?? 0,
      },
      data: {
        trigger: definition.trigger,
        definition,
        selected: triggerSelected,
        activeAddAnchor,
        onOpenAddMenu,
        renderAddMenu,
      },
      draggable: true,
      selectable: true,
    },
    ...definition.blocks.map((block) => ({
      id: block.id,
      type: "workflowBlock",
      position: manualPositions[block.id] ?? {
        x: positioned.find((n) => n.id === block.id)?.x ?? 0,
        y: positioned.find((n) => n.id === block.id)?.y ?? 0,
      },
      data: {
        block,
        selected: selectedBlockId === block.id,
        executed: runHighlight.executed.has(block.id),
        failed: runHighlight.failed.has(block.id),
        activeAddAnchor,
        onChangeBlock,
        onOpenAddMenu,
        renderAddMenu,
      },
      draggable: true,
    })),
  ];

  const edges: Edge[] = graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "purple",
    label: edge.label,
    animated: edge.kind === "branch" || edge.kind === "outcome",
    data: { kind: edge.kind },
  }));

  return { nodes, edges };
}

export function WorkflowFlowCanvas({
  definition,
  selectedBlockId,
  triggerSelected,
  runHighlight,
  onSelectBlock,
  onSelectTrigger,
  activeAddAnchor,
  onChangeBlock,
  onOpenAddMenu,
  renderAddMenu,
  toolbar,
  configurationPanel,
  runTracePanel,
  layoutStorageKey,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  definition: WorkflowDefinition;
  selectedBlockId: string | null;
  triggerSelected: boolean;
  runHighlight: { executed: Set<string>; failed: Set<string> };
  onSelectBlock: (blockId: string | null) => void;
  onSelectTrigger: () => void;
  activeAddAnchor?: WorkflowCanvasInsertAnchor | null;
  onChangeBlock: (block: WorkflowBlock) => void;
  onOpenAddMenu?: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
  toolbar?: ReactNode;
  configurationPanel?: ReactNode;
  runTracePanel?: ReactNode;
  layoutStorageKey?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const nodeIds = useMemo(
    () => new Set(["__trigger__", ...definition.blocks.map((block) => block.id)]),
    [definition.blocks],
  );
  const [manualPositions, setManualPositions] = useState<ManualPositionMap>({});
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  useEffect(() => {
    setLayoutLoaded(false);
    if (!layoutStorageKey) {
      setManualPositions({});
      setLayoutLoaded(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(layoutStorageKey);
      setManualPositions(stored ? (JSON.parse(stored) as ManualPositionMap) : {});
    } catch {
      setManualPositions({});
    }
    setLayoutLoaded(true);
  }, [layoutStorageKey]);

  useEffect(() => {
    setManualPositions((positions) => {
      const next = Object.fromEntries(
        Object.entries(positions).filter(([nodeId]) => nodeIds.has(nodeId)),
      ) as ManualPositionMap;
      return Object.keys(next).length === Object.keys(positions).length ? positions : next;
    });
  }, [nodeIds]);

  useEffect(() => {
    if (!layoutStorageKey || !layoutLoaded) return;
    try {
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(manualPositions));
    } catch {
      // Ignore storage failures; the canvas remains usable for the current session.
    }
  }, [layoutLoaded, layoutStorageKey, manualPositions]);

  const resetLayout = useCallback(() => {
    setManualPositions({});
    if (layoutStorageKey) {
      try {
        window.localStorage.removeItem(layoutStorageKey);
      } catch {
        // Ignore storage failures; clearing in-memory positions is enough.
      }
    }
  }, [layoutStorageKey]);

  const { nodes, edges } = useMemo(
    () =>
      definitionToFlow(
        definition,
        selectedBlockId,
        triggerSelected,
        runHighlight,
        activeAddAnchor ?? null,
        onChangeBlock,
        onOpenAddMenu ?? (() => undefined),
        renderAddMenu,
        manualPositions,
      ),
    [
      definition,
      selectedBlockId,
      triggerSelected,
      runHighlight,
      activeAddAnchor,
      onChangeBlock,
      onOpenAddMenu,
      renderAddMenu,
      manualPositions,
    ],
  );
  const [flowNodes, setFlowNodes] = useState<Node[]>(nodes);

  useEffect(() => {
    setFlowNodes(nodes);
  }, [nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    const positionChanges = changes.filter(
      (change): change is Extract<NodeChange, { type: "position" }> =>
        change.type === "position" && Boolean(change.position),
    );
    if (positionChanges.length === 0) return;
    setManualPositions((positions) => {
      const next = { ...positions };
      for (const change of positionChanges) {
        if (change.position) next[change.id] = change.position;
      }
      return next;
    });
  }, []);

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[640px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] shadow-sm">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (node.id === "__trigger__") {
            onSelectTrigger();
            return;
          }
          onSelectBlock(node.id);
        }}
        onPaneClick={() => {
          onSelectBlock(null);
          onOpenAddMenu?.(null);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="hsl(var(--border))" />
        <CanvasViewportControls
          canUndo={canUndo ?? false}
          canRedo={canRedo ?? false}
          onUndo={onUndo}
          onRedo={onRedo}
          hasCustomLayout={Object.keys(manualPositions).length > 0}
          onResetLayout={resetLayout}
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={miniMapNodeColor}
          maskColor="hsl(var(--surface-0) / 0.55)"
          className="!m-4 !h-[128px] !w-[184px] !rounded-lg !border !border-[hsl(var(--border))] !bg-[hsl(var(--surface-1))] !shadow-xl"
        />
      </ReactFlow>
      <div className="pointer-events-none absolute inset-0 z-10">
        {toolbar ? (
          <div className="pointer-events-auto absolute left-4 right-4 top-4">{toolbar}</div>
        ) : null}
        {configurationPanel ? (
          <div className="pointer-events-auto absolute right-4 top-[96px] max-h-[calc(100%-7rem)] w-[360px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
            {configurationPanel}
          </div>
        ) : null}
        {runTracePanel ? (
          <div className="pointer-events-auto absolute bottom-[164px] right-4 max-h-[300px] w-[360px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
            {runTracePanel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CanvasViewportControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasCustomLayout,
  onResetLayout,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  hasCustomLayout: boolean;
  onResetLayout: () => void;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const controlClass =
    "flex size-9 items-center justify-center text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <Panel position="bottom-left" className="m-0">
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl shadow-black/10">
        <button
          type="button"
          className={controlClass}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          aria-label="Undo workflow change"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          aria-label="Redo workflow change"
        >
          <Redo2 className="size-4" />
        </button>
        <div className="h-px bg-[hsl(var(--border))]" />
        <button
          type="button"
          className={controlClass}
          onClick={onResetLayout}
          disabled={!hasCustomLayout}
          title="Auto layout"
          aria-label="Reset to automatic layout"
        >
          <LayoutGrid className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => zoomIn({ duration: 180 })}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => zoomOut({ duration: 180 })}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => fitView({ padding: 0.24, duration: 220 })}
          title="Fit view"
          aria-label="Fit view"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
    </Panel>
  );
}
