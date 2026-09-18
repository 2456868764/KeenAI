"use client";

import {
  type AgentAbandonedWorkflowTrigger,
  type AgentOtherSettings,
  getAgentOtherSettings,
  listBrands,
  updateAgentOtherSettings,
} from "@/lib/api";
import { Button, cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, TimerReset, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const WORKFLOW_TRIGGER_OPTIONS: Array<{
  value: AgentAbandonedWorkflowTrigger;
  label: string;
}> = [
  { value: "user_visits_website", label: "User visits your website" },
  { value: "visitor_visits_page", label: "Visitor visits a page" },
  { value: "user_opens_conversation", label: "User opens a new conversation" },
  { value: "visitor_opens_conversation", label: "Visitor opens a new conversation" },
  { value: "first_message", label: "Customer sends their first message" },
  { value: "any_message", label: "Customer sends any message" },
  { value: "customer_unresponsive", label: "Customer has been unresponsive" },
  { value: "teammate_unresponsive", label: "Teammate has been unresponsive" },
  { value: "conversation_state_changed", label: "Teammate changes the conversation state" },
];

const WORKFLOW_DELAY_OPTIONS = [5, 10, 15, 30, 60, 120, 1_440] as const;

function clampInteger(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function durationParts(totalMinutes: number) {
  const days = Math.floor(totalMinutes / 1_440);
  const remainder = totalMinutes % 1_440;
  return { days, hours: Math.floor(remainder / 60), minutes: remainder % 60 };
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 1_440) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = minutes / 1_440;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function AgentOtherSettingsForm() {
  const queryClient = useQueryClient();
  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: listBrands });
  const brands = brandsQuery.data?.items ?? [];
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? brands[0] ?? null;
  const settingsQuery = useQuery({
    queryKey: ["agent-other-settings", selectedBrand?.id],
    queryFn: () => getAgentOtherSettings(selectedBrand?.id ?? ""),
    enabled: Boolean(selectedBrand?.id),
  });
  const [form, setForm] = useState<AgentOtherSettings | null>(null);
  const persistedSettings = useRef<AgentOtherSettings | null>(null);

  useEffect(() => {
    if (selectedBrand) setSelectedBrandId(selectedBrand.id);
  }, [selectedBrand]);

  useEffect(() => {
    const settings = settingsQuery.data?.settings;
    if (!settings) return;
    persistedSettings.current = settings;
    setForm((current) => (!current || current.brandId !== settings.brandId ? settings : current));
  }, [settingsQuery.data]);

  const saveWorkflow = useMutation({
    mutationFn: async () => {
      if (!selectedBrand || !form) throw new Error("agent_settings_not_ready");
      return updateAgentOtherSettings(selectedBrand.id, {
        abandonedWorkflowTriggers: form.abandonedWorkflowTriggers,
        abandonedWorkflowDelayMinutes: form.abandonedWorkflowDelayMinutes,
      });
    },
    onSuccess: ({ settings }) => {
      persistedSettings.current = settings;
      setForm(settings);
      queryClient.setQueryData(["agent-other-settings", settings.brandId], { settings });
    },
  });
  const saveImmediate = useMutation({
    mutationFn: async ({
      patch,
    }: {
      patch: Parameters<typeof updateAgentOtherSettings>[1];
      rollback: Parameters<typeof updateAgentOtherSettings>[1];
    }) => {
      if (!selectedBrand) throw new Error("agent_settings_not_ready");
      return updateAgentOtherSettings(selectedBrand.id, patch);
    },
    onSuccess: ({ settings }) => {
      persistedSettings.current = settings;
      queryClient.setQueryData(["agent-other-settings", settings.brandId], { settings });
    },
    onError: (_error, { rollback }) => {
      setForm((current) => (current ? { ...current, ...rollback } : current));
    },
  });

  if (brandsQuery.isLoading || (selectedBrand && settingsQuery.isLoading)) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
        <Loader2 className="size-4 animate-spin" /> Loading settings...
      </div>
    );
  }
  if (brandsQuery.error || settingsQuery.error) {
    return <p className="text-sm text-red-500">Unable to load Keeni settings.</p>;
  }
  if (!selectedBrand || !form) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Create a brand before configuring Keeni AI Agent.
      </p>
    );
  }

  const closeDelay = durationParts(form.autoCloseResolvedDelayMinutes);

  const setCloseDelay = (part: "days" | "hours" | "minutes", value: number) => {
    const next = { ...closeDelay, [part]: value };
    setForm({
      ...form,
      autoCloseResolvedDelayMinutes: Math.max(
        1,
        Math.min(525_600, next.days * 1_440 + next.hours * 60 + next.minutes),
      ),
    });
  };

  const toggleWorkflowTrigger = (trigger: AgentAbandonedWorkflowTrigger) => {
    const selected = form.abandonedWorkflowTriggers.includes(trigger);
    setForm({
      ...form,
      abandonedWorkflowTriggers: selected
        ? form.abandonedWorkflowTriggers.filter((item) => item !== trigger)
        : [...form.abandonedWorkflowTriggers, trigger],
    });
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (saveImmediate.isPending) return;
        saveWorkflow.mutate();
      }}
    >
      {brands.length > 1 ? (
        <div className="max-w-xs">
          <label htmlFor="agent-other-brand" className="mb-1.5 block text-xs font-medium">
            Brand
          </label>
          <select
            id="agent-other-brand"
            value={selectedBrand.id}
            onChange={(event) => {
              setSelectedBrandId(event.target.value);
              setForm(null);
            }}
            className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 text-sm"
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <SettingCard
        icon={UserRoundCheck}
        title="Allow handoff to teammates"
        description="Let Keeni connect conversations to your team when a human needs to take over."
        checked={form.allowHandoff}
        disabled={saveImmediate.isPending || saveWorkflow.isPending}
        onToggle={() => {
          const allowHandoff = !form.allowHandoff;
          setForm({ ...form, allowHandoff });
          saveImmediate.mutate({
            patch: { allowHandoff },
            rollback: { allowHandoff: form.allowHandoff },
          });
        }}
      />

      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
        <div className="flex min-h-24 items-center gap-4 px-5 py-4">
          <SettingIcon icon={Check} />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              Automatically close resolved Keeni conversations
            </h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Automatically close conversations after Keeni resolves them to keep the inbox clean.
            </p>
          </div>
          <Toggle
            checked={form.autoCloseResolvedEnabled}
            label="Automatically close resolved conversations"
            disabled={saveImmediate.isPending || saveWorkflow.isPending}
            onToggle={() => {
              const autoCloseResolvedEnabled = !form.autoCloseResolvedEnabled;
              setForm({ ...form, autoCloseResolvedEnabled });
              saveImmediate.mutate({
                patch: { autoCloseResolvedEnabled },
                rollback: { autoCloseResolvedEnabled: form.autoCloseResolvedEnabled },
              });
            }}
          />
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] px-5 py-4 text-sm",
            !form.autoCloseResolvedEnabled && "opacity-50",
          )}
        >
          <span className="mr-1 font-medium">Close after</span>
          <DurationInput
            label="days"
            value={closeDelay.days}
            max={365}
            disabled={
              !form.autoCloseResolvedEnabled || saveImmediate.isPending || saveWorkflow.isPending
            }
            onChange={(value) => setCloseDelay("days", value)}
            onCommit={() =>
              saveImmediate.mutate({
                patch: { autoCloseResolvedDelayMinutes: form.autoCloseResolvedDelayMinutes },
                rollback: {
                  autoCloseResolvedDelayMinutes:
                    persistedSettings.current?.autoCloseResolvedDelayMinutes ?? 7,
                },
              })
            }
          />
          <DurationInput
            label="hours"
            value={closeDelay.hours}
            max={23}
            disabled={
              !form.autoCloseResolvedEnabled || saveImmediate.isPending || saveWorkflow.isPending
            }
            onChange={(value) => setCloseDelay("hours", value)}
            onCommit={() =>
              saveImmediate.mutate({
                patch: { autoCloseResolvedDelayMinutes: form.autoCloseResolvedDelayMinutes },
                rollback: {
                  autoCloseResolvedDelayMinutes:
                    persistedSettings.current?.autoCloseResolvedDelayMinutes ?? 7,
                },
              })
            }
          />
          <DurationInput
            label="minutes"
            value={closeDelay.minutes}
            max={59}
            disabled={
              !form.autoCloseResolvedEnabled || saveImmediate.isPending || saveWorkflow.isPending
            }
            onChange={(value) => setCloseDelay("minutes", value)}
            onCommit={() =>
              saveImmediate.mutate({
                patch: { autoCloseResolvedDelayMinutes: form.autoCloseResolvedDelayMinutes },
                rollback: {
                  autoCloseResolvedDelayMinutes:
                    persistedSettings.current?.autoCloseResolvedDelayMinutes ?? 7,
                },
              })
            }
          />
        </div>
      </section>

      {saveImmediate.isError ? (
        <p className="text-xs text-red-500">Unable to save the setting.</p>
      ) : null}

      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-5 py-5 shadow-sm">
        <div className="flex items-start gap-4">
          <SettingIcon icon={TimerReset} />
          <div>
            <h2 className="text-sm font-semibold">Auto-close abandoned workflow conversations</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[hsl(var(--muted-foreground))]">
              When a workflow is active and a customer has not replied to an automated message, the
              conversation will be marked as closed. A later reply re-opens the conversation.
            </p>
          </div>
        </div>

        <div className="mt-5 border-y border-[hsl(var(--border))] py-3">
          {WORKFLOW_TRIGGER_OPTIONS.map((option) => {
            const checked = form.abandonedWorkflowTriggers.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex min-h-9 cursor-pointer items-center gap-3 px-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleWorkflowTrigger(option.value)}
                  className="size-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>

        <div className="pt-4">
          <label htmlFor="workflow-close-delay" className="block text-xs font-medium">
            How long should the workflow wait before closing the conversation?
          </label>
          <select
            id="workflow-close-delay"
            value={form.abandonedWorkflowDelayMinutes}
            onChange={(event) =>
              setForm({
                ...form,
                abandonedWorkflowDelayMinutes: Number(event.target.value),
              })
            }
            className="mt-2 h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm"
          >
            {WORKFLOW_DELAY_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDelay(minutes)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={saveWorkflow.isPending || saveImmediate.isPending}
          >
            {saveWorkflow.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saveWorkflow.isPending}
            onClick={() => {
              if (persistedSettings.current) setForm(persistedSettings.current);
              saveWorkflow.reset();
            }}
          >
            Cancel
          </Button>
          {saveWorkflow.isSuccess ? <span className="text-xs text-emerald-600">Saved</span> : null}
          {saveWorkflow.isError ? <span className="text-xs text-red-500">Save failed</span> : null}
        </div>
      </section>
    </form>
  );
}

function SettingCard({
  icon,
  title,
  description,
  checked,
  disabled,
  onToggle,
}: {
  icon: typeof UserRoundCheck;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="flex min-h-24 items-center gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-5 py-4 shadow-sm">
      <SettingIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} label={title} onToggle={onToggle} />
    </section>
  );
}

function SettingIcon({ icon: Icon }: { icon: typeof UserRoundCheck }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--primary))]">
      <Icon className="size-5" />
    </span>
  );
}

function Toggle({
  checked,
  disabled = false,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
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
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-3))]",
      )}
    >
      <span
        className={cn(
          "absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function DurationInput({
  label,
  value,
  max,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(clampInteger(event.target.value, 0, max))}
        onBlur={onCommit}
        className="h-9 w-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 text-center text-sm disabled:cursor-not-allowed"
      />
      <span>{label}</span>
    </label>
  );
}
