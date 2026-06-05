"use client";

import type { WorkflowBlock } from "@/lib/api";
import { Input } from "@keenai/ui";
import { Trash2 } from "lucide-react";

function NextBlockSelect({
  value,
  blocks,
  currentId,
  onChange,
  placeholder,
}: {
  value: string | null;
  blocks: WorkflowBlock[];
  currentId: string;
  onChange: (nextId: string | null) => void;
  placeholder?: string;
}) {
  const options = blocks.filter((b) => b.id !== currentId);
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value.trim() || null)}
      className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
    >
      <option value="">{placeholder ?? "(none — end or linear next)"}</option>
      {options.map((b) => (
        <option key={b.id} value={b.id}>
          {b.type.replaceAll("_", " ")} · {b.id}
        </option>
      ))}
    </select>
  );
}

export function WorkflowBlockEditor({
  block,
  index,
  allBlocks,
  onChange,
  onRemove,
}: {
  block: WorkflowBlock;
  index: number;
  allBlocks: WorkflowBlock[];
  onChange: (block: WorkflowBlock) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {index + 1}. {block.type.replaceAll("_", " ")}
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
            rows={4}
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
            rows={4}
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
          <div className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Outcome routing (optional)
            </p>
            <div className="block space-y-1 text-xs">
              <span>Resolved →</span>
              <NextBlockSelect
                value={block.outcomeRouting?.resolvedNext ?? null}
                blocks={allBlocks}
                currentId={block.id}
                onChange={(resolvedNext) =>
                  onChange({
                    ...block,
                    outcomeRouting: {
                      resolvedNext,
                      unresolvedNext: block.outcomeRouting?.unresolvedNext ?? null,
                      escalatedNext: block.outcomeRouting?.escalatedNext ?? null,
                    },
                  })
                }
              />
            </div>
            <div className="block space-y-1 text-xs">
              <span>Unresolved →</span>
              <NextBlockSelect
                value={block.outcomeRouting?.unresolvedNext ?? null}
                blocks={allBlocks}
                currentId={block.id}
                onChange={(unresolvedNext) =>
                  onChange({
                    ...block,
                    outcomeRouting: {
                      resolvedNext: block.outcomeRouting?.resolvedNext ?? null,
                      unresolvedNext,
                      escalatedNext: block.outcomeRouting?.escalatedNext ?? null,
                    },
                  })
                }
              />
            </div>
            <div className="block space-y-1 text-xs">
              <span>Escalated →</span>
              <NextBlockSelect
                value={block.outcomeRouting?.escalatedNext ?? null}
                blocks={allBlocks}
                currentId={block.id}
                onChange={(escalatedNext) =>
                  onChange({
                    ...block,
                    outcomeRouting: {
                      resolvedNext: block.outcomeRouting?.resolvedNext ?? null,
                      unresolvedNext: block.outcomeRouting?.unresolvedNext ?? null,
                      escalatedNext,
                    },
                  })
                }
              />
            </div>
          </div>
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
          />
          {block.method === "POST" ? (
            <textarea
              value={block.body ?? ""}
              onChange={(e) => onChange({ ...block, body: e.target.value })}
              rows={4}
              placeholder="JSON body (optional)"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            />
          ) : null}
        </>
      ) : null}

      {block.type === "branches" ? (
        <div className="space-y-3">
          {block.branches.map((branch, branchIndex) => (
            <div
              key={`${block.id}-branch-${branchIndex}`}
              className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3"
            >
              <Input
                placeholder="Branch label"
                value={branch.label ?? ""}
                onChange={(e) => {
                  const branches = [...block.branches];
                  branches[branchIndex] = { ...branch, label: e.target.value };
                  onChange({ ...block, branches });
                }}
              />
              <select
                value={branch.condition?.field ?? ""}
                onChange={(e) => {
                  const field = e.target.value as
                    | "channelType"
                    | "priority"
                    | "conversationStatus"
                    | "";
                  const branches = [...block.branches];
                  branches[branchIndex] = {
                    ...branch,
                    condition: field
                      ? {
                          field,
                          op: branch.condition?.op ?? "eq",
                          value: branch.condition?.value ?? "",
                        }
                      : undefined,
                  };
                  onChange({ ...block, branches });
                }}
                className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
              >
                <option value="">Default (no condition)</option>
                <option value="channelType">channelType</option>
                <option value="priority">priority</option>
                <option value="conversationStatus">conversationStatus</option>
              </select>
              {branch.condition ? (
                <>
                  <select
                    value={branch.condition.op}
                    onChange={(e) => {
                      const condition = branch.condition;
                      if (!condition) return;
                      const branches = [...block.branches];
                      branches[branchIndex] = {
                        ...branch,
                        condition: { ...condition, op: e.target.value as "eq" | "neq" },
                      };
                      onChange({ ...block, branches });
                    }}
                    className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
                  >
                    <option value="eq">equals</option>
                    <option value="neq">not equals</option>
                  </select>
                  <Input
                    placeholder="Value"
                    value={branch.condition.value}
                    onChange={(e) => {
                      const condition = branch.condition;
                      if (!condition) return;
                      const branches = [...block.branches];
                      branches[branchIndex] = {
                        ...branch,
                        condition: { ...condition, value: e.target.value },
                      };
                      onChange({ ...block, branches });
                    }}
                  />
                </>
              ) : null}
              <NextBlockSelect
                value={branch.nextId}
                blocks={allBlocks}
                currentId={block.id}
                onChange={(nextId) => {
                  const branches = [...block.branches];
                  branches[branchIndex] = { ...branch, nextId };
                  onChange({ ...block, branches });
                }}
                placeholder="(none)"
              />
            </div>
          ))}
          <div className="block space-y-1 text-xs">
            <span>Else →</span>
            <NextBlockSelect
              value={block.elseNextId ?? null}
              blocks={allBlocks}
              currentId={block.id}
              onChange={(elseNextId) => onChange({ ...block, elseNextId })}
            />
          </div>
        </div>
      ) : null}

      {block.type === "convert_to_ticket" ? (
        <>
          <Input
            placeholder="Ticket title (optional)"
            value={block.title ?? ""}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Creates a ticket from the current conversation when this step runs.
          </p>
        </>
      ) : null}
    </div>
  );
}
