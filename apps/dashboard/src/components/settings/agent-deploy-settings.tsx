"use client";

import {
  type Workflow,
  getAgentOtherSettings,
  listBrands,
  listWorkflows,
  updateAgentOtherSettings,
} from "@/lib/api";
import { cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function isAgentWorkflow(workflow: Workflow): boolean {
  const definition = workflow.publishedDefinition ?? workflow.definition;
  return definition.blocks.some((block) => block.type === "let_keeni_answer");
}

function updatedLabel(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function AgentDeploySettings() {
  const queryClient = useQueryClient();
  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: listBrands });
  const workflowsQuery = useQuery({ queryKey: ["workflows"], queryFn: listWorkflows });
  const brands = brandsQuery.data?.items ?? [];
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? brands[0] ?? null;
  const settingsQuery = useQuery({
    queryKey: ["agent-other-settings", selectedBrand?.id],
    queryFn: () => getAgentOtherSettings(selectedBrand?.id ?? ""),
    enabled: Boolean(selectedBrand?.id),
  });
  const [simpleOpen, setSimpleOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(true);

  useEffect(() => {
    if (!selectedBrandId && selectedBrand) setSelectedBrandId(selectedBrand.id);
  }, [selectedBrand, selectedBrandId]);

  const agentWorkflows = useMemo(() => {
    if (!selectedBrand) return [];
    return (workflowsQuery.data?.items ?? [])
      .filter(
        (workflow) =>
          workflow.status === "published" &&
          (!workflow.brandId || workflow.brandId === selectedBrand.id) &&
          isAgentWorkflow(workflow),
      )
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
  }, [selectedBrand, workflowsQuery.data]);

  const settings = settingsQuery.data?.settings;
  const simpleEnabled = settings?.simpleDeployEnabled ?? false;
  const advancedLive = !simpleEnabled && agentWorkflows.length > 0;

  const toggleSimple = useMutation({
    mutationFn: () => {
      if (!selectedBrand) throw new Error("brand_not_selected");
      return updateAgentOtherSettings(selectedBrand.id, {
        simpleDeployEnabled: !simpleEnabled,
      });
    },
    onSuccess: ({ settings: updated }) => {
      queryClient.setQueryData(["agent-other-settings", updated.brandId], {
        settings: updated,
      });
    },
  });

  if (brandsQuery.isLoading || workflowsQuery.isLoading || settingsQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
        <Loader2 className="size-4 animate-spin" />
        Loading deploy settings...
      </div>
    );
  }

  const error = brandsQuery.error ?? workflowsQuery.error ?? settingsQuery.error;
  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error instanceof Error ? error.message : "Unable to load deploy settings."}
      </div>
    );
  }

  if (!selectedBrand || !settings) {
    return (
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">
        Create a brand before configuring Agent deployment.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {brands.length > 1 ? (
        <label className="block max-w-xs text-xs font-medium">
          Brand
          <select
            className="mt-1.5 h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            value={selectedBrand.id}
            onChange={(event) => setSelectedBrandId(event.target.value)}
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <DeploySection
        title="Simple deploy"
        description="Fastest way to deploy Keeni AI Agent to your Messenger."
        live={simpleEnabled}
        open={simpleOpen}
        onToggle={() => setSimpleOpen((value) => !value)}
      >
        <div className="flex min-h-24 items-center justify-between gap-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Enable basic AI agent</h3>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Let the basic AI agent resolve issues and answer questions.
            </p>
          </div>
          <Toggle
            checked={simpleEnabled}
            disabled={toggleSimple.isPending}
            label="Enable basic AI agent"
            onToggle={() => toggleSimple.mutate()}
          />
        </div>
        {toggleSimple.error ? (
          <p className="mt-3 text-xs text-red-600">
            {toggleSimple.error instanceof Error
              ? toggleSimple.error.message
              : "Unable to update deployment mode."}
          </p>
        ) : null}
      </DeploySection>

      <DeploySection
        title="Advanced deploy with Workflows"
        description="Precisely automate what Keeni AI Agent should do and when."
        live={advancedLive}
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((value) => !value)}
      >
        <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
          {agentWorkflows.length > 0 ? (
            agentWorkflows.map((workflow, index) => (
              <Link
                key={workflow.id}
                href={`/dashboard/agent/workflows/${workflow.id}`}
                className={cn(
                  "flex items-center justify-between gap-5 px-5 py-4 transition-colors hover:bg-[hsl(var(--surface-2))]",
                  index > 0 && "border-t border-[hsl(var(--border))]",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{workflow.name}</p>
                  {simpleEnabled ? (
                    <p className="mt-2 flex max-w-2xl items-start gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                      <span>
                        This workflow will not fire because Simple deploy is enabled. Disable Simple
                        deploy above to enable this workflow.
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                  <StatusBadge live>Live</StatusBadge>
                  <span>{updatedLabel(workflow.updatedAt)}</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No live AI workflows yet.
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Link
            href="/dashboard/agent/workflows"
            className="inline-flex h-9 items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-[hsl(var(--surface-2))]"
          >
            View all workflows
          </Link>
        </div>
      </DeploySection>
    </div>
  );
}

function DeploySection({
  title,
  description,
  live,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  live: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            <StatusBadge live={live}>{live ? "Live" : "Disabled"}</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? <div className="border-t border-[hsl(var(--border))] p-6">{children}</div> : null}
    </section>
  );
}

function StatusBadge({ live, children }: { live: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        live
          ? "bg-violet-100 text-violet-700"
          : "bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]",
      )}
    >
      {children}
    </span>
  );
}

function Toggle({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-3))]",
      )}
    >
      <span
        className={cn(
          "absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
