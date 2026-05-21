"use client";

import { AppHeader } from "@/components/layout/app-header";
import { type Workflow, createWorkflow, listWorkflows, publishWorkflow } from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function WorkflowListShell() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
  });

  const create = useMutation({
    mutationFn: () =>
      createWorkflow({
        name: "New workflow",
        definition: {
          trigger: "first_message",
          blocks: [
            {
              id: "reply",
              type: "send_message",
              plainText: "Thanks for reaching out! We will get back to you shortly.",
            },
          ],
        },
      }),
    onSuccess: ({ workflow }) => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      router.push(`/workflows/${workflow.id}`);
    },
  });

  const publish = useMutation({
    mutationFn: (id: string) => publishWorkflow(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Workflows">
        <Button type="button" size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1 size-4" />
              New workflow
            </>
          )}
        </Button>
      </AppHeader>

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading workflows…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-8 text-center">
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              No workflows yet. Create one to auto-reply on the first customer message.
            </p>
            <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
              Create workflow
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
            {items.map((wf) => (
              <WorkflowRow
                key={wf.id}
                workflow={wf}
                publishing={publish.isPending && publish.variables === wf.id}
                onPublish={() => publish.mutate(wf.id)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function WorkflowRow({
  workflow,
  publishing,
  onPublish,
}: {
  workflow: Workflow;
  publishing: boolean;
  onPublish: () => void;
}) {
  const blockSummary = workflow.definition.blocks.map((b) => b.type.replace("_", " ")).join(" → ");

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <Link
          href={`/workflows/${workflow.id}`}
          className="font-medium text-[hsl(var(--foreground))] hover:underline"
        >
          {workflow.name}
        </Link>
        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {workflow.definition.trigger.replace("_", " ")} · {blockSummary}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={workflow.status} />
        {workflow.status === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={publishing}
            onClick={onPublish}
          >
            {publishing ? <Loader2 className="size-4 animate-spin" /> : "Publish"}
          </Button>
        ) : null}
        <Link
          href={`/workflows/${workflow.id}`}
          className="text-xs text-[hsl(var(--primary))] hover:underline"
        >
          Edit
        </Link>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: Workflow["status"] }) {
  const published = status === "published";
  return (
    <span
      className={
        published
          ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400"
          : "rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]"
      }
    >
      {status}
    </span>
  );
}
