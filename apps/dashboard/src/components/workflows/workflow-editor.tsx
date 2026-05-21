"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  getWorkflow,
  publishWorkflow,
  updateWorkflow,
  type WorkflowBlock,
  type WorkflowDefinition,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

function newBlockId() {
  return `block-${Date.now().toString(36)}`;
}

export function WorkflowEditorShell({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => getWorkflow(workflowId),
  });

  const [name, setName] = useState("");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);

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

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        {isLoading || !definition ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </section>

            <section className="space-y-2">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Trigger</label>
              <select
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

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Blocks</h2>
                <BlockAddMenu
                  onAdd={(block) =>
                    setDefinition({ ...definition, blocks: [...definition.blocks, block] })
                  }
                />
              </div>
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
            </section>

            {workflow ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Status: <span className="font-medium">{workflow.status}</span> · Updated{" "}
                {new Date(workflow.updatedAt).toLocaleString()}
              </p>
            ) : null}
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
        }
      }}
      className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs"
    >
      <option value="">+ Add block</option>
      <option value="send_message">Send message</option>
      <option value="assign">Assign</option>
      <option value="close">Close conversation</option>
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
        <textarea
          value={block.plainText}
          onChange={(e) => onChange({ ...block, plainText: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
        />
      ) : null}

      {block.type === "assign" ? (
        <Input
          placeholder="Assignee member ID (optional)"
          value={block.assigneeId ?? ""}
          onChange={(e) =>
            onChange({ ...block, assigneeId: e.target.value.trim() || null })
          }
        />
      ) : null}

      {block.type === "close" ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Closes the conversation when this step runs.
        </p>
      ) : null}
    </div>
  );
}
