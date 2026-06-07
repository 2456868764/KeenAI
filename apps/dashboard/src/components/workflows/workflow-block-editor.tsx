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

      {block.type === "apply_rules" ? (
        <div className="space-y-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Runs every matching rule branch (all-match). Each rule needs a condition and target
            block.
          </p>
          {block.rules.map((rule, ruleIndex) => (
            <div
              key={`${block.id}-rule-${ruleIndex}`}
              className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3"
            >
              <Input
                placeholder="Rule label"
                value={rule.label ?? ""}
                onChange={(e) => {
                  const rules = [...block.rules];
                  rules[ruleIndex] = { ...rule, label: e.target.value };
                  onChange({ ...block, rules });
                }}
              />
              <select
                value={rule.condition.field}
                onChange={(e) => {
                  const rules = [...block.rules];
                  rules[ruleIndex] = {
                    ...rule,
                    condition: {
                      ...rule.condition,
                      field: e.target.value as "channelType" | "priority" | "conversationStatus",
                    },
                  };
                  onChange({ ...block, rules });
                }}
                className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
              >
                <option value="channelType">channelType</option>
                <option value="priority">priority</option>
                <option value="conversationStatus">conversationStatus</option>
              </select>
              <select
                value={rule.condition.op}
                onChange={(e) => {
                  const rules = [...block.rules];
                  rules[ruleIndex] = {
                    ...rule,
                    condition: { ...rule.condition, op: e.target.value as "eq" | "neq" },
                  };
                  onChange({ ...block, rules });
                }}
                className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
              >
                <option value="eq">equals</option>
                <option value="neq">not equals</option>
              </select>
              <Input
                placeholder="Value"
                value={rule.condition.value}
                onChange={(e) => {
                  const rules = [...block.rules];
                  rules[ruleIndex] = {
                    ...rule,
                    condition: { ...rule.condition, value: e.target.value },
                  };
                  onChange({ ...block, rules });
                }}
              />
              <NextBlockSelect
                value={rule.nextId}
                blocks={allBlocks}
                currentId={block.id}
                onChange={(nextId) => {
                  const rules = [...block.rules];
                  rules[ruleIndex] = { ...rule, nextId: nextId ?? rule.nextId };
                  onChange({ ...block, rules });
                }}
                placeholder="Target block"
              />
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-[hsl(var(--primary))]"
            onClick={() =>
              onChange({
                ...block,
                rules: [
                  ...block.rules,
                  {
                    label: "",
                    condition: { field: "channelType", op: "eq", value: "" },
                    nextId: allBlocks.find((b) => b.id !== block.id)?.id ?? block.id,
                  },
                ],
              })
            }
          >
            + Add rule
          </button>
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

      {block.type === "link_ticket" ? (
        <>
          <Input
            placeholder="Parent ticket ID (optional — uses conversation ticket)"
            value={block.parentTicketId ?? ""}
            onChange={(e) =>
              onChange({ ...block, parentTicketId: e.target.value.trim() || undefined })
            }
          />
          <Input
            placeholder="Child ticket ID"
            value={block.childTicketId}
            onChange={(e) => onChange({ ...block, childTicketId: e.target.value.trim() })}
          />
          <select
            value={block.linkType}
            onChange={(e) =>
              onChange({
                ...block,
                linkType: e.target.value as "tracks" | "relates" | "blocks",
              })
            }
            className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
          >
            <option value="tracks">tracks</option>
            <option value="relates">relates</option>
            <option value="blocks">blocks</option>
          </select>
        </>
      ) : null}

      {block.type === "send_ticket_update" ? (
        <>
          <Input
            placeholder="Ticket ID (optional — uses conversation ticket)"
            value={block.ticketId ?? ""}
            onChange={(e) => onChange({ ...block, ticketId: e.target.value.trim() || undefined })}
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Emails the customer a React Email status update when SMTP is configured.
          </p>
        </>
      ) : null}

      {block.type === "collect_data" ? (
        <>
          <textarea
            value={block.prompt}
            onChange={(e) => onChange({ ...block, prompt: e.target.value })}
            rows={3}
            placeholder="Prompt shown to the customer"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <input
              type="checkbox"
              checked={block.allowFreeText ?? false}
              onChange={(e) => onChange({ ...block, allowFreeText: e.target.checked })}
            />
            Allow free-text reply
          </label>
          <select
            value={block.autoCloseMinutes ?? ""}
            onChange={(e) =>
              onChange({
                ...block,
                autoCloseMinutes: e.target.value ? Number.parseInt(e.target.value, 10) : undefined,
              })
            }
            className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
          >
            <option value="">No auto-close timer</option>
            {[1, 3, 5, 7, 10, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                Auto-close after {minutes} min
              </option>
            ))}
          </select>
          <div className="space-y-2">
            {block.fields.map((field, fieldIndex) => (
              <div
                key={field.key}
                className="grid gap-2 rounded border border-[hsl(var(--border))] p-2"
              >
                <Input
                  placeholder="Field key"
                  value={field.key}
                  onChange={(e) => {
                    const fields = [...block.fields];
                    fields[fieldIndex] = { ...field, key: e.target.value.trim() };
                    onChange({ ...block, fields });
                  }}
                />
                <Input
                  placeholder="Label"
                  value={field.label}
                  onChange={(e) => {
                    const fields = [...block.fields];
                    fields[fieldIndex] = { ...field, label: e.target.value };
                    onChange({ ...block, fields });
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-[hsl(var(--primary))]"
              onClick={() =>
                onChange({
                  ...block,
                  fields: [
                    ...block.fields,
                    { key: `field_${block.fields.length + 1}`, label: "New field", required: true },
                  ],
                })
              }
            >
              + Add field
            </button>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Suspends the workflow until the widget submits attributes via workflow-input.
          </p>
        </>
      ) : null}

      {block.type === "reply_buttons" ? (
        <>
          <textarea
            value={block.prompt}
            onChange={(e) => onChange({ ...block, prompt: e.target.value })}
            rows={3}
            placeholder="Prompt shown above the buttons"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <input
              type="checkbox"
              checked={block.allowFreeText ?? false}
              onChange={(e) => onChange({ ...block, allowFreeText: e.target.checked })}
            />
            Allow free-text reply
          </label>
          <select
            value={block.autoCloseMinutes ?? ""}
            onChange={(e) =>
              onChange({
                ...block,
                autoCloseMinutes: e.target.value ? Number.parseInt(e.target.value, 10) : undefined,
              })
            }
            className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-sm"
          >
            <option value="">No auto-close timer</option>
            {[1, 3, 5, 7, 10, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                Auto-close after {minutes} min
              </option>
            ))}
          </select>
          <div className="space-y-2">
            {block.buttons.map((button, buttonIndex) => (
              <div
                key={button.id}
                className="grid gap-2 rounded border border-[hsl(var(--border))] p-2"
              >
                <Input
                  placeholder="Button id"
                  value={button.id}
                  onChange={(e) => {
                    const buttons = [...block.buttons];
                    buttons[buttonIndex] = { ...button, id: e.target.value.trim() };
                    onChange({ ...block, buttons });
                  }}
                />
                <Input
                  placeholder="Label"
                  value={button.label}
                  onChange={(e) => {
                    const buttons = [...block.buttons];
                    buttons[buttonIndex] = { ...button, label: e.target.value };
                    onChange({ ...block, buttons });
                  }}
                />
                <NextBlockSelect
                  value={button.nextId}
                  blocks={allBlocks}
                  currentId={block.id}
                  onChange={(nextId) => {
                    const buttons = [...block.buttons];
                    buttons[buttonIndex] = { ...button, nextId };
                    onChange({ ...block, buttons });
                  }}
                  placeholder="Target block"
                />
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-[hsl(var(--primary))]"
              onClick={() =>
                onChange({
                  ...block,
                  buttons: [
                    ...block.buttons,
                    {
                      id: `btn_${block.buttons.length + 1}`,
                      label: "New button",
                      nextId: null,
                    },
                  ],
                })
              }
            >
              + Add button
            </button>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Suspends until the widget posts a button click via workflow-button.
          </p>
        </>
      ) : null}
    </div>
  );
}
