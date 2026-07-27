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
  GripVertical,
  LayoutGrid,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  allBlocks: WorkflowBlock[];
  selected: boolean;
  executed: boolean;
  failed: boolean;
  canDelete: boolean;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeBlock: (block: WorkflowBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
};

type TriggerNodeData = {
  trigger: WorkflowDefinition["trigger"];
  definition: WorkflowDefinition;
  selected: boolean;
  settings?: ReactNode;
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

function insertAnchorNodeId(anchor: WorkflowCanvasInsertAnchor | null): string | null {
  if (!anchor) return null;
  return anchor.kind === "trigger" ? "__trigger__" : anchor.blockId;
}

const categoryStyles: Record<
  ReturnType<typeof blockCategory> | "trigger",
  { border: string; badge: string; wash: string; icon: string }
> = {
  trigger: {
    border: "border-violet-500/60",
    badge: "text-violet-700",
    wash: "bg-violet-500/10",
    icon: "text-violet-600",
  },
  message: {
    border: "border-violet-500/55",
    badge: "text-violet-700",
    wash: "bg-violet-500/10",
    icon: "text-violet-600",
  },
  condition: {
    border: "border-amber-500/50",
    badge: "text-amber-700",
    wash: "bg-amber-500/10",
    icon: "text-amber-600",
  },
  action: {
    border: "border-[hsl(var(--border))]",
    badge: "text-[hsl(var(--primary))]",
    wash: "bg-[hsl(var(--surface-2))]",
    icon: "text-[hsl(var(--primary))]",
  },
};

const workflowCanvasTheme = {
  "--surface-0": "250 100% 99%",
  "--surface-1": "255 86% 97%",
  "--surface-2": "0 0% 100%",
  "--foreground": "230 30% 22%",
  "--muted-foreground": "226 20% 48%",
  "--border": "246 40% 88%",
  "--primary": "262 83% 58%",
} as CSSProperties;

function WorkflowBlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const block = data.block;
  const category = blockCategory(block);
  const styles = categoryStyles[category];
  const addAnchor: WorkflowCanvasInsertAnchor = { kind: "block", blockId: block.id };
  const addMenuOpen = sameInsertAnchor(data.activeAddAnchor, addAnchor);

  return (
    <div
      className={cn(
        "group relative w-[320px] rounded-xl border bg-[hsl(var(--surface-1))] p-3 shadow-[0_14px_32px_rgba(124,58,237,0.12)] transition-shadow",
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
      <div className="flex items-center gap-2 px-1">
        <p className={cn("shrink-0 text-[10px] font-semibold tracking-wide", styles.badge)}>
          {workflowBlockShellLabel(block)}
        </p>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">/</span>
        <p className="min-w-0 truncate text-xs font-semibold text-[hsl(var(--foreground))]">
          {workflowBlockTitle(block)}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {data.failed ? (
            <CircleAlert className="size-4 text-red-400" />
          ) : data.executed ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : null}
          <button
            type="button"
            disabled={!data.canDelete}
            className={cn(
              "nodrag nopan flex size-7 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-35 group-hover:opacity-100",
              data.selected || data.failed ? "opacity-100" : "",
            )}
            aria-label={`Delete ${workflowBlockTitle(block)}`}
            onClick={(event) => {
              event.stopPropagation();
              data.onDeleteBlock(block.id);
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <BlockPreview
        block={block}
        allBlocks={data.allBlocks}
        activeAddAnchor={data.activeAddAnchor}
        onChangeBlock={data.onChangeBlock}
        onOpenAddMenu={data.onOpenAddMenu}
        renderAddMenu={data.renderAddMenu}
      />

      <div className="mt-3 border-t border-[hsl(var(--border))] pt-3">
        <button
          type="button"
          className={cn(
            "nodrag nopan flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-700",
            addMenuOpen ? "border-violet-400/60 bg-violet-500/15 text-violet-700" : "",
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
          "nodrag nopan absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-[hsl(var(--surface-0))] text-violet-600 shadow transition-colors group-hover:flex hover:bg-violet-500/15",
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
  const addAnchor: WorkflowCanvasInsertAnchor = { kind: "trigger" };
  const addMenuOpen = sameInsertAnchor(data.activeAddAnchor, addAnchor);
  const detailGroups = triggerDetailGroups(data.definition);

  return (
    <div
      className={cn(
        "group relative w-[320px] rounded-xl border bg-[hsl(var(--surface-1))] p-3 shadow-[0_14px_32px_rgba(124,58,237,0.12)]",
        styles.border,
        data.selected
          ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : "",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-600">
          <Zap className="size-4" />
        </span>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
            Trigger action
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {triggerPreviewTitle(data.trigger)}
        </p>
        <p className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
          {triggerPreviewDescription(data.trigger)}
        </p>
        <div className="mt-3 space-y-2">
          {detailGroups.map((group) => (
            <TriggerChipGroup key={group.label} label={group.label} values={group.values} />
          ))}
        </div>
      </div>
      {data.selected && data.settings ? (
        <div
          className="nodrag nopan mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-violet-200/80 bg-white p-3"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                Trigger settings
              </p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Configure when this workflow starts.
              </p>
            </div>
          </div>
          <div className="space-y-4">{data.settings}</div>
        </div>
      ) : null}
      <button
        type="button"
        className={cn(
          "nodrag nopan absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-[hsl(var(--surface-0))] text-violet-600 shadow transition-colors hover:bg-violet-500/15",
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
}: {
  label: string;
  values: string[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="max-w-full truncate rounded-full bg-[hsl(var(--surface-1))] px-2 py-1 text-[10px] font-medium text-[hsl(var(--muted-foreground))]"
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

function workflowBlockShellLabel(block: WorkflowBlock): string {
  switch (blockCategory(block)) {
    case "message":
      return "Website visitor flow";
    case "condition":
      return "Workflow Branch";
    default:
      return "Workflow Action";
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
  allBlocks,
  activeAddAnchor,
  onChangeBlock,
  onOpenAddMenu,
  renderAddMenu,
}: {
  block: WorkflowBlock;
  allBlocks: WorkflowBlock[];
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
          <Bot className="size-4 text-violet-600" />
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
          className="nodrag nopan ml-auto mt-3 flex h-8 w-fit items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-[11px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
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

  if (block.type === "goto") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <CanvasBlockSelect
          value={block.targetBlockId}
          currentId={block.id}
          blocks={allBlocks}
          placeholder="Target block"
          onChange={(targetBlockId) => onChangeBlock({ ...block, targetBlockId })}
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
    return <DataCollectionPreview block={block} onChangeBlock={onChangeBlock} />;
  }

  if (
    block.type === "http_request" ||
    block.type === "webhook_emit" ||
    block.type === "mcp_call" ||
    block.type === "script"
  ) {
    return <ExternalActionPreview block={block} onChangeBlock={onChangeBlock} />;
  }

  if (
    block.type === "convert_to_ticket" ||
    block.type === "apply_sla" ||
    block.type === "link_ticket" ||
    block.type === "send_ticket_update" ||
    block.type === "set_ticket_state"
  ) {
    return <TicketActionPreview block={block} onChangeBlock={onChangeBlock} />;
  }

  if (
    block.type === "show_expected_reply_time" ||
    block.type === "collect_customer_reply" ||
    block.type === "disable_customer_reply" ||
    block.type === "csat"
  ) {
    return <CustomerInteractionPreview block={block} onChangeBlock={onChangeBlock} />;
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

const autoCloseMinuteOptions = [1, 3, 5, 7, 10, 15, 30, 60];
const conditionFieldOptions = ["channelType", "priority", "conversationStatus"] as const;
const conditionOperatorOptions = ["eq", "neq"] as const;

function CanvasBlockSelect({
  value,
  blocks,
  currentId,
  placeholder,
  onChange,
}: {
  value: string | null | undefined;
  blocks: WorkflowBlock[];
  currentId: string;
  placeholder: string;
  onChange: (blockId: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      aria-label={placeholder}
      className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {blocks
        .filter((block) => block.id !== currentId)
        .map((block) => (
          <option key={block.id} value={block.id}>
            {workflowBlockTitle(block)} · {block.id}
          </option>
        ))}
    </select>
  );
}

function DataCollectionPreview({
  block,
  onChangeBlock,
}: {
  block: Extract<WorkflowBlock, { type: "collect_data" | "send_ticket_form" }>;
  onChangeBlock: (block: WorkflowBlock) => void;
}) {
  const fieldLimit = block.type === "send_ticket_form" ? 8 : 6;

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
      <textarea
        value={block.prompt}
        rows={2}
        aria-label="Customer prompt"
        placeholder="Prompt shown to the customer"
        className="nodrag nopan min-h-[56px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChangeBlock({ ...block, prompt: event.target.value })}
      />

      {block.type === "send_ticket_form" ? (
        <div className="grid gap-1.5">
          <input
            value={block.title ?? ""}
            aria-label="Ticket title"
            placeholder="Ticket title when no linked ticket exists"
            className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChangeBlock({ ...block, title: event.target.value.trim() || undefined })
            }
          />
          <input
            value={block.ticketId ?? ""}
            aria-label="Ticket ID"
            placeholder="Ticket ID, optional"
            className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChangeBlock({ ...block, ticketId: event.target.value.trim() || undefined })
            }
          />
        </div>
      ) : (
        <label
          className="nodrag nopan flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={block.allowFreeText ?? false}
            onChange={(event) => onChangeBlock({ ...block, allowFreeText: event.target.checked })}
          />
          Allow free-text reply
        </label>
      )}

      <select
        value={block.autoCloseMinutes ?? ""}
        aria-label="Auto close timer"
        className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          onChangeBlock({
            ...block,
            autoCloseMinutes: event.target.value
              ? Number.parseInt(event.target.value, 10)
              : undefined,
          })
        }
      >
        <option value="">No auto-close timer</option>
        {autoCloseMinuteOptions.map((minutes) => (
          <option key={minutes} value={minutes}>
            Auto-close after {minutes} min
          </option>
        ))}
      </select>

      <div className="grid gap-1.5">
        {block.fields.slice(0, fieldLimit).map((field, fieldIndex) => {
          const ticketField = field as Extract<
            WorkflowBlock,
            { type: "send_ticket_form" }
          >["fields"][number];
          return (
            <div
              key={`${field.key}-${fieldIndex}`}
              className="nodrag nopan grid gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] p-2"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-1.5">
                <input
                  value={field.key}
                  aria-label={`Field ${fieldIndex + 1} key`}
                  placeholder="key"
                  className="h-7 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
                  onChange={(event) => {
                    const fields = [...block.fields];
                    fields[fieldIndex] = { ...field, key: event.target.value.trim() };
                    onChangeBlock({ ...block, fields });
                  }}
                />
                <input
                  value={field.label}
                  aria-label={`Field ${fieldIndex + 1} label`}
                  placeholder="Label"
                  className="h-7 min-w-0 flex-[1.3] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
                  onChange={(event) => {
                    const fields = [...block.fields];
                    fields[fieldIndex] = { ...field, label: event.target.value };
                    onChangeBlock({ ...block, fields });
                  }}
                />
                <button
                  type="button"
                  disabled={block.fields.length <= 1}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={`Remove ${field.label || `field ${fieldIndex + 1}`}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChangeBlock({
                      ...block,
                      fields: block.fields.filter((_, index) => index !== fieldIndex),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {block.type === "send_ticket_form" ? (
                  <select
                    value={ticketField.type ?? "text"}
                    aria-label={`Field ${fieldIndex + 1} type`}
                    className="h-7 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
                    onChange={(event) => {
                      const type = event.target.value as
                        | "text"
                        | "number"
                        | "boolean"
                        | "select"
                        | "date";
                      const fields = [...block.fields];
                      fields[fieldIndex] = {
                        ...ticketField,
                        type,
                        options:
                          type === "select" ? (ticketField.options ?? ["Option"]) : undefined,
                      };
                      onChangeBlock({ ...block, fields });
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="select">Select</option>
                    <option value="date">Date</option>
                  </select>
                ) : null}
                <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                  <input
                    type="checkbox"
                    checked={field.required ?? true}
                    onChange={(event) => {
                      const fields = [...block.fields];
                      fields[fieldIndex] = { ...field, required: event.target.checked };
                      onChangeBlock({ ...block, fields });
                    }}
                  />
                  Required
                </label>
              </div>

              {block.type === "send_ticket_form" && ticketField.type === "select" ? (
                <input
                  value={(ticketField.options ?? []).join(", ")}
                  aria-label={`Field ${fieldIndex + 1} options`}
                  placeholder="Options, comma separated"
                  className="h-7 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
                  onChange={(event) => {
                    const fields = [...block.fields];
                    fields[fieldIndex] = {
                      ...ticketField,
                      options: event.target.value
                        .split(",")
                        .map((option) => option.trim())
                        .filter(Boolean),
                    };
                    onChangeBlock({ ...block, fields });
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={block.fields.length >= fieldLimit}
        className="nodrag nopan flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={(event) => {
          event.stopPropagation();
          const nextIndex = block.fields.length + 1;
          onChangeBlock({
            ...block,
            fields: [
              ...block.fields,
              {
                key: `field_${nextIndex}`,
                label: "New field",
                required: true,
                ...(block.type === "send_ticket_form" ? { type: "text" as const } : {}),
              },
            ],
          });
        }}
      >
        <Plus className="size-3.5" />
        Add field
      </button>
    </div>
  );
}

function ExternalActionPreview({
  block,
  onChangeBlock,
}: {
  block: Extract<WorkflowBlock, { type: "http_request" | "webhook_emit" | "mcp_call" | "script" }>;
  onChangeBlock: (block: WorkflowBlock) => void;
}) {
  if (block.type === "http_request") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-1.5">
          <select
            value={block.method}
            aria-label="HTTP method"
            className="nodrag nopan h-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChangeBlock({ ...block, method: event.target.value as "GET" | "POST" })
            }
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input
            value={block.url}
            aria-label="HTTP URL"
            placeholder="https://api.example.com"
            className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onChangeBlock({ ...block, url: event.target.value })}
          />
        </div>
        {block.method === "POST" ? (
          <textarea
            value={block.body ?? ""}
            rows={4}
            aria-label="HTTP body"
            placeholder="JSON body, optional"
            className="nodrag nopan min-h-[88px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 font-mono text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onChangeBlock({ ...block, body: event.target.value })}
          />
        ) : null}
      </div>
    );
  }

  if (block.type === "webhook_emit") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.url}
          aria-label="Webhook URL"
          placeholder="Webhook URL"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, url: event.target.value })}
        />
        <input
          value={block.eventName ?? ""}
          aria-label="Webhook event name"
          placeholder="Event name, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, eventName: event.target.value.trim() || undefined })
          }
        />
        <textarea
          value={block.payload ?? ""}
          rows={4}
          aria-label="Webhook payload"
          placeholder='Payload JSON, optional, e.g. {"plan":"pro"}'
          className="nodrag nopan min-h-[88px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 font-mono text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, payload: event.target.value })}
        />
      </div>
    );
  }

  if (block.type === "mcp_call") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            value={block.serverId}
            aria-label="MCP server ID"
            placeholder="Server ID"
            className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onChangeBlock({ ...block, serverId: event.target.value.trim() })}
          />
          <input
            value={block.toolName}
            aria-label="MCP tool name"
            placeholder="Tool name"
            className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onChangeBlock({ ...block, toolName: event.target.value.trim() })}
          />
        </div>
        <textarea
          value={JSON.stringify(block.arguments ?? {}, null, 2)}
          rows={5}
          aria-label="MCP arguments JSON"
          placeholder='{"message":"hello"}'
          className="nodrag nopan min-h-[108px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 font-mono text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (!text) {
              onChangeBlock({ ...block, arguments: {} });
              return;
            }
            try {
              const parsed = JSON.parse(text) as unknown;
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                onChangeBlock({ ...block, arguments: parsed as Record<string, unknown> });
              }
            } catch {
              // Keep the last valid JSON object while the user is typing.
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
      <textarea
        value={block.code}
        rows={6}
        aria-label="Script code"
        placeholder="JavaScript body. Return a JSON-serializable value."
        className="nodrag nopan min-h-[132px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 font-mono text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChangeBlock({ ...block, code: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          min={1}
          max={5000}
          value={block.timeoutMs ?? 2000}
          aria-label="Script timeout milliseconds"
          className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, timeoutMs: Number.parseInt(event.target.value, 10) || 2000 })
          }
        />
        <input
          type="number"
          min={1}
          max={128}
          value={block.memoryMb ?? 32}
          aria-label="Script memory megabytes"
          className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, memoryMb: Number.parseInt(event.target.value, 10) || 32 })
          }
        />
      </div>
    </div>
  );
}

function TicketActionPreview({
  block,
  onChangeBlock,
}: {
  block: Extract<
    WorkflowBlock,
    {
      type:
        | "convert_to_ticket"
        | "apply_sla"
        | "link_ticket"
        | "send_ticket_update"
        | "set_ticket_state";
    }
  >;
  onChangeBlock: (block: WorkflowBlock) => void;
}) {
  if (block.type === "convert_to_ticket") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.title ?? ""}
          aria-label="Ticket title"
          placeholder="Ticket title, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, title: event.target.value })}
        />
      </div>
    );
  }

  if (block.type === "apply_sla") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.policyId ?? ""}
          aria-label="SLA policy ID"
          placeholder="SLA policy ID, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, policyId: event.target.value.trim() || undefined })
          }
        />
      </div>
    );
  }

  if (block.type === "link_ticket") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.parentTicketId ?? ""}
          aria-label="Parent ticket ID"
          placeholder="Parent ticket ID, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, parentTicketId: event.target.value.trim() || undefined })
          }
        />
        <input
          value={block.childTicketId}
          aria-label="Child ticket ID"
          placeholder="Child ticket ID"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, childTicketId: event.target.value.trim() })
          }
        />
        <select
          value={block.linkType}
          aria-label="Ticket link type"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              linkType: event.target.value as "tracks" | "relates" | "blocks",
            })
          }
        >
          <option value="tracks">tracks</option>
          <option value="relates">relates</option>
          <option value="blocks">blocks</option>
        </select>
      </div>
    );
  }

  if (block.type === "send_ticket_update") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.ticketId ?? ""}
          aria-label="Ticket ID"
          placeholder="Ticket ID, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, ticketId: event.target.value.trim() || undefined })
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
      <input
        value={block.ticketId ?? ""}
        aria-label="Ticket ID"
        placeholder="Ticket ID, optional"
        className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          onChangeBlock({ ...block, ticketId: event.target.value.trim() || undefined })
        }
      />
      <input
        value={block.statusId ?? ""}
        aria-label="Status ID"
        placeholder="Status ID, optional"
        className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          onChangeBlock({ ...block, statusId: event.target.value.trim() || undefined })
        }
      />
      <input
        value={block.statusName ?? ""}
        aria-label="Status name"
        placeholder="Status name"
        className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          onChangeBlock({ ...block, statusName: event.target.value.trim() || undefined })
        }
      />
    </div>
  );
}

function CustomerInteractionPreview({
  block,
  onChangeBlock,
}: {
  block: Extract<
    WorkflowBlock,
    {
      type:
        | "show_expected_reply_time"
        | "collect_customer_reply"
        | "disable_customer_reply"
        | "csat";
    }
  >;
  onChangeBlock: (block: WorkflowBlock) => void;
}) {
  if (block.type === "show_expected_reply_time") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <input
          value={block.policyId ?? ""}
          aria-label="SLA policy ID"
          placeholder="SLA policy ID, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, policyId: event.target.value.trim() || undefined })
          }
        />
        <input
          type="number"
          min={1}
          max={20160}
          value={block.fallbackMinutes ?? 240}
          aria-label="Fallback reply time minutes"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              fallbackMinutes: Number.parseInt(event.target.value, 10) || 240,
            })
          }
        />
        <textarea
          value={block.insideOfficeHoursText ?? ""}
          rows={2}
          aria-label="Inside office hours text"
          placeholder="Inside office hours text"
          className="nodrag nopan min-h-[56px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, insideOfficeHoursText: event.target.value || undefined })
          }
        />
        <textarea
          value={block.outsideOfficeHoursText ?? ""}
          rows={2}
          aria-label="Outside office hours text"
          placeholder="Outside office hours text"
          className="nodrag nopan min-h-[56px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, outsideOfficeHoursText: event.target.value || undefined })
          }
        />
      </div>
    );
  }

  if (block.type === "collect_customer_reply") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <textarea
          value={block.prompt ?? ""}
          rows={2}
          aria-label="Customer reply prompt"
          placeholder="Prompt shown before waiting for reply"
          className="nodrag nopan min-h-[56px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChangeBlock({ ...block, prompt: event.target.value || undefined })}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="number"
            min={0}
            max={30}
            value={block.bufferSeconds ?? 2}
            aria-label="Buffer seconds"
            className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChangeBlock({
                ...block,
                bufferSeconds: Math.max(
                  0,
                  Math.min(30, Number.parseInt(event.target.value, 10) || 0),
                ),
              })
            }
          />
          <select
            value={block.autoCloseMinutes ?? ""}
            aria-label="Auto close timer"
            className="nodrag nopan h-8 min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChangeBlock({
                ...block,
                autoCloseMinutes: event.target.value
                  ? Number.parseInt(event.target.value, 10)
                  : undefined,
              })
            }
          >
            <option value="">No timer</option>
            {autoCloseMinuteOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (block.type === "disable_customer_reply") {
    return (
      <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <label
          className="nodrag nopan flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={block.disabled ?? true}
            onChange={(event) => onChangeBlock({ ...block, disabled: event.target.checked })}
          />
          Disable customer composer
        </label>
        <input
          value={block.reason ?? ""}
          aria-label="Disable reason"
          placeholder="Reason, optional"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({ ...block, reason: event.target.value.trim() || undefined })
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
      <textarea
        value={block.prompt}
        rows={2}
        aria-label="CSAT prompt"
        placeholder="CSAT prompt"
        className="nodrag nopan min-h-[56px] w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChangeBlock({ ...block, prompt: event.target.value })}
      />
      <label
        className="nodrag nopan flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={block.allowComment ?? true}
          onChange={(event) => onChangeBlock({ ...block, allowComment: event.target.checked })}
        />
        Allow rating comment
      </label>
      <label
        className="nodrag nopan flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={block.waitForRating ?? false}
          onChange={(event) => onChangeBlock({ ...block, waitForRating: event.target.checked })}
        />
        Wait for rating
      </label>
      {block.waitForRating ? (
        <input
          type="number"
          min={1}
          value={block.waitForRatingMinutes ?? ""}
          aria-label="Rating timeout minutes"
          placeholder="Rating timeout minutes"
          className="nodrag nopan h-8 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-xs text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChangeBlock({
              ...block,
              waitForRatingMinutes: event.target.value
                ? Number.parseInt(event.target.value, 10)
                : undefined,
            })
          }
        />
      ) : null}
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
    <div className="mt-3 grid justify-items-end gap-2">
      {block.buttons.slice(0, 8).map((button, buttonIndex) => {
        const anchor: WorkflowCanvasInsertAnchor = {
          kind: "button",
          blockId: block.id,
          buttonId: button.id,
        };
        const open = sameInsertAnchor(activeAddAnchor, anchor);
        return (
          <div
            key={button.id}
            className="group/route relative flex max-w-full items-center gap-1.5"
          >
            <GripVertical className="size-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <div
              className={cn(
                "nodrag nopan flex max-w-[210px] items-center gap-1 rounded-lg border bg-[hsl(var(--surface-0))] px-3 py-1.5 shadow-sm transition-colors",
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
                className="min-w-0 flex-1 bg-transparent text-right text-[11px] font-medium text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
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
                  "absolute -right-8 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-violet-500 text-white shadow-sm transition-colors hover:bg-violet-600",
                  open ? "ring-2 ring-violet-200" : "",
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
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35 group-hover/route:opacity-100"
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
                className="nodrag nopan absolute left-[calc(100%+2.25rem)] top-0 z-50"
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
            condition={branch.condition}
            conditionOptional
            anchor={{ kind: "branch", blockId: block.id, branchIndex }}
            activeAddAnchor={activeAddAnchor}
            onChangeLabel={(label) => {
              const branches = [...block.branches];
              branches[branchIndex] = { ...branch, label };
              onChangeBlock({ ...block, branches });
            }}
            onChangeCondition={(condition) => {
              const branches = [...block.branches];
              branches[branchIndex] = { ...branch, condition };
              onChangeBlock({ ...block, branches });
            }}
            onRemove={
              block.branches.length > 1
                ? () =>
                    onChangeBlock({
                      ...block,
                      branches: block.branches.filter((_, index) => index !== branchIndex),
                    })
                : undefined
            }
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
        <button
          type="button"
          className="nodrag nopan flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-[hsl(var(--surface-0))] text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={block.branches.length >= 8}
          onClick={(event) => {
            event.stopPropagation();
            const nextIndex = block.branches.length + 1;
            onChangeBlock({
              ...block,
              branches: [
                ...block.branches,
                {
                  label: `Branch ${nextIndex}`,
                  condition: { field: "channelType", op: "eq", value: "" },
                  nextId: null,
                },
              ],
            });
          }}
        >
          <Plus className="size-3.5" />
          Add branch
        </button>
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
          condition={rule.condition}
          anchor={{ kind: "rule", blockId: block.id, ruleIndex }}
          activeAddAnchor={activeAddAnchor}
          onChangeLabel={(label) => {
            const rules = [...block.rules];
            rules[ruleIndex] = { ...rule, label };
            onChangeBlock({ ...block, rules });
          }}
          onChangeCondition={(condition) => {
            if (!condition) return;
            const rules = [...block.rules];
            rules[ruleIndex] = { ...rule, condition };
            onChangeBlock({ ...block, rules });
          }}
          onRemove={
            block.rules.length > 1
              ? () =>
                  onChangeBlock({
                    ...block,
                    rules: block.rules.filter((_, index) => index !== ruleIndex),
                  })
              : undefined
          }
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      ))}
      <button
        type="button"
        className="nodrag nopan flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-[hsl(var(--surface-0))] text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={block.rules.length >= 8}
        onClick={(event) => {
          event.stopPropagation();
          const nextIndex = block.rules.length + 1;
          onChangeBlock({
            ...block,
            rules: [
              ...block.rules,
              {
                label: `Rule ${nextIndex}`,
                condition: { field: "channelType", op: "eq", value: "" },
                nextId: block.rules[0]?.nextId ?? block.id,
              },
            ],
          });
        }}
      >
        <Plus className="size-3.5" />
        Add rule
      </button>
    </div>
  );
}

function EditableRouteRow({
  label,
  fallbackLabel,
  connected,
  condition,
  conditionOptional = false,
  anchor,
  activeAddAnchor,
  onChangeLabel,
  onChangeCondition,
  onRemove,
  onOpenAddMenu,
  renderAddMenu,
}: {
  label: string;
  fallbackLabel: string;
  connected: boolean;
  condition?: { field: string; op: string; value: string };
  conditionOptional?: boolean;
  anchor: WorkflowCanvasInsertAnchor;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onChangeLabel: (label: string) => void;
  onChangeCondition?: (condition: { field: string; op: string; value: string } | undefined) => void;
  onRemove?: () => void;
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
        {onRemove ? (
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-red-500/10 hover:text-red-300"
            aria-label={`Remove ${label || fallbackLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-violet-500/15 hover:text-violet-700",
            open ? "bg-violet-500/15 text-violet-700" : "",
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
      {onChangeCondition ? (
        <div
          className="nodrag nopan mt-1.5 grid grid-cols-[minmax(0,1fr)_72px] gap-1.5 rounded-lg border border-amber-400/20 bg-[hsl(var(--surface-0))] p-1.5"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <select
            value={condition?.field ?? ""}
            aria-label={`${fallbackLabel} condition field`}
            className="h-7 min-w-0 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70"
            onChange={(event) => {
              const field = event.target.value;
              if (!field && conditionOptional) {
                onChangeCondition(undefined);
                return;
              }
              onChangeCondition({
                field: field || conditionFieldOptions[0],
                op: condition?.op ?? "eq",
                value: condition?.value ?? "",
              });
            }}
          >
            {conditionOptional ? <option value="">No condition</option> : null}
            {conditionFieldOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
          <select
            value={condition?.op ?? "eq"}
            aria-label={`${fallbackLabel} condition operator`}
            disabled={!condition && conditionOptional}
            className="h-7 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none focus:border-violet-400/70 disabled:cursor-not-allowed disabled:opacity-40"
            onChange={(event) => {
              if (!condition && conditionOptional) return;
              onChangeCondition({
                field: condition?.field ?? conditionFieldOptions[0],
                op: event.target.value,
                value: condition?.value ?? "",
              });
            }}
          >
            {conditionOperatorOptions.map((operator) => (
              <option key={operator} value={operator}>
                {operator === "eq" ? "is" : "is not"}
              </option>
            ))}
          </select>
          <input
            value={condition?.value ?? ""}
            aria-label={`${fallbackLabel} condition value`}
            placeholder="Value"
            disabled={!condition && conditionOptional}
            className="col-span-2 h-7 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[11px] text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-violet-400/70 disabled:cursor-not-allowed disabled:opacity-40"
            onChange={(event) => {
              if (!condition && conditionOptional) return;
              onChangeCondition({
                field: condition?.field ?? conditionFieldOptions[0],
                op: condition?.op ?? "eq",
                value: event.target.value,
              });
            }}
          />
        </div>
      ) : null}
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
            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700"
            : "border-amber-400/30 bg-[hsl(var(--surface-0))] text-amber-700 hover:bg-amber-500/15",
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
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700"
                  : "border-violet-400/30 bg-[hsl(var(--surface-0))] text-violet-700 hover:bg-violet-500/15",
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
      return "When customer visits a page";
    case "new_messenger_conversation":
      return "When customer opens a new conversation";
    case "first_message":
      return "When customer sends the first message";
    case "any_message":
      return "When any message is received";
    case "teammate_message":
      return "When teammate sends a message";
    case "conversation_state_changed":
      return "When conversation state changes";
    case "assigned_to_team":
      return "When conversation is assigned to team";
    case "assigned_to_member":
      return "When conversation is assigned to member";
    case "customer_unresponsive":
      return "When customer becomes unresponsive";
    case "teammate_unresponsive":
      return "When teammate becomes unresponsive";
    case "teammate_added_note":
      return "When teammate adds a note";
    case "ticket_created":
      return "When ticket is created";
    case "ticket_state_changed":
      return "When ticket state changes";
    case "schedule":
      return "When schedule matches";
    case "webhook":
      return "When webhook is received";
    case "event_match":
      return "When custom event matches";
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

function workflowBlockLayoutHeight(block: WorkflowBlock): number {
  switch (block.type) {
    case "collect_data":
      return 360 + Math.min(block.fields.length, 6) * 96;
    case "send_ticket_form":
      return 430 + Math.min(block.fields.length, 8) * 128;
    case "send_message":
    case "assign":
    case "reply_buttons":
      return 340;
    case "branches":
      return 360 + Math.min(block.branches.length, 4) * 100;
    case "apply_rules":
      return 320 + Math.min(block.rules.length, 4) * 100;
    case "goto":
      return 280;
    case "http_request":
    case "webhook_emit":
    case "mcp_call":
    case "script":
      return 420;
    case "show_expected_reply_time":
      return 460;
    case "collect_customer_reply":
    case "csat":
    case "link_ticket":
    case "set_ticket_state":
      return 360;
    case "disable_customer_reply":
    case "convert_to_ticket":
    case "apply_sla":
    case "send_ticket_update":
      return 280;
    case "add_note":
    case "tag_conversation":
    case "tag_end_user":
      return 280;
    default:
      return workflowNodeSize.block.height;
  }
}

function workflowTriggerLayoutHeight(selected: boolean): number {
  return selected ? 660 : workflowNodeSize.trigger.height;
}

function definitionToFlow(
  definition: WorkflowDefinition,
  selectedBlockId: string | null,
  triggerSelected: boolean,
  runHighlight: { executed: Set<string>; failed: Set<string> },
  activeAddAnchor: WorkflowCanvasInsertAnchor | null,
  onChangeBlock: (block: WorkflowBlock) => void,
  onDeleteBlock: (blockId: string) => void,
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void,
  renderAddMenu: ((anchor: WorkflowCanvasInsertAnchor) => ReactNode) | undefined,
  triggerSettings: ReactNode | undefined,
  manualPositions: ManualPositionMap,
): { nodes: Node[]; edges: Edge[] } {
  const graphEdges = collectWorkflowEdges(definition);
  const layoutInput = [
    {
      id: "__trigger__",
      width: workflowNodeSize.trigger.width,
      height: workflowTriggerLayoutHeight(triggerSelected),
    },
    ...definition.blocks.map((block) => ({
      id: block.id,
      width: workflowNodeSize.block.width,
      height: workflowBlockLayoutHeight(block),
    })),
  ];

  const positioned = layoutWorkflowNodes(layoutInput, graphEdges);

  const nodes: Node[] = [
    {
      id: "__trigger__",
      type: "workflowTrigger",
      zIndex: triggerSelected || insertAnchorNodeId(activeAddAnchor) === "__trigger__" ? 100 : 1,
      position: manualPositions.__trigger__ ?? {
        x: positioned.find((n) => n.id === "__trigger__")?.x ?? 0,
        y: positioned.find((n) => n.id === "__trigger__")?.y ?? 0,
      },
      data: {
        trigger: definition.trigger,
        definition,
        selected: triggerSelected,
        settings: triggerSettings,
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
      zIndex:
        selectedBlockId === block.id || insertAnchorNodeId(activeAddAnchor) === block.id ? 100 : 1,
      position: manualPositions[block.id] ?? {
        x: positioned.find((n) => n.id === block.id)?.x ?? 0,
        y: positioned.find((n) => n.id === block.id)?.y ?? 0,
      },
      data: {
        block,
        allBlocks: definition.blocks,
        selected: selectedBlockId === block.id,
        executed: runHighlight.executed.has(block.id),
        failed: runHighlight.failed.has(block.id),
        canDelete: definition.blocks.length > 1,
        activeAddAnchor,
        onChangeBlock,
        onDeleteBlock,
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
  onDeleteBlock,
  onOpenAddMenu,
  renderAddMenu,
  triggerSettings,
  toolbar,
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
  onDeleteBlock: (blockId: string) => void;
  onOpenAddMenu?: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
  triggerSettings?: ReactNode;
  toolbar?: ReactNode;
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
        onDeleteBlock,
        onOpenAddMenu ?? (() => undefined),
        renderAddMenu,
        triggerSettings,
        manualPositions,
      ),
    [
      definition,
      selectedBlockId,
      triggerSelected,
      runHighlight,
      activeAddAnchor,
      onChangeBlock,
      onDeleteBlock,
      onOpenAddMenu,
      renderAddMenu,
      triggerSettings,
      manualPositions,
    ],
  );
  const [flowNodes, setFlowNodes] = useState<Node[]>(nodes);
  const initialFitNodes = useMemo(
    () => [
      { id: "__trigger__" },
      ...definition.blocks.slice(0, 3).map((block) => ({ id: block.id })),
    ],
    [definition.blocks],
  );

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
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--surface-0))]"
      style={workflowCanvasTheme}
    >
      {toolbar ? <div className="relative z-20 shrink-0">{toolbar}</div> : null}
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.28, minZoom: 0.72, maxZoom: 0.96, nodes: initialFitNodes }}
          minZoom={0.6}
          maxZoom={1.4}
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
            className="!m-3 !h-[104px] !w-[152px] !rounded-lg !border !border-[hsl(var(--border))] !bg-[hsl(var(--surface-1))] !shadow-xl"
          />
        </ReactFlow>
        <div className="pointer-events-none absolute inset-0 z-10">
          {runTracePanel ? (
            <div className="pointer-events-auto absolute bottom-[164px] right-4 max-h-[300px] w-[360px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
              {runTracePanel}
            </div>
          ) : null}
        </div>
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
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-[0_14px_32px_rgba(124,58,237,0.12)]">
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
