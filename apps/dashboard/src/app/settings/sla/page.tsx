"use client";

import { AppHeader } from "@/components/layout/app-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import {
  type OfficeHours,
  type SlaPolicy,
  createSlaPolicy,
  getOfficeHours,
  listSlaPolicies,
  updateSlaPolicy,
  upsertOfficeHours,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const WEEKDAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

function secToHours(sec: number | null): string {
  if (sec == null) return "";
  return String(Math.round(sec / 3600));
}

function hoursToSec(hours: string): number | undefined {
  const n = Number.parseFloat(hours);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 3600);
}

function PolicyRow({ policy }: { policy: SlaPolicy }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(policy.name);
  const [firstHours, setFirstHours] = useState(secToHours(policy.firstResponseSec));
  const [resolutionHours, setResolutionHours] = useState(secToHours(policy.resolutionSec));
  const [operationalHoursOnly, setOperationalHoursOnly] = useState(policy.operationalHoursOnly);
  const [enabled, setEnabled] = useState(policy.enabled);

  useEffect(() => {
    setName(policy.name);
    setFirstHours(secToHours(policy.firstResponseSec));
    setResolutionHours(secToHours(policy.resolutionSec));
    setOperationalHoursOnly(policy.operationalHoursOnly);
    setEnabled(policy.enabled);
  }, [policy]);

  const save = useMutation({
    mutationFn: () =>
      updateSlaPolicy(policy.id, {
        name: name.trim(),
        firstResponseSec: hoursToSec(firstHours) ?? null,
        resolutionSec: hoursToSec(resolutionHours) ?? null,
        operationalHoursOnly,
        enabled,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sla-policies"] });
    },
  });

  return (
    <form
      className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <label htmlFor={`policy-name-${policy.id}`} className="mb-1 block text-xs font-medium">
            Name
          </label>
          <Input
            id={`policy-name-${policy.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="w-28">
          <label htmlFor={`policy-first-${policy.id}`} className="mb-1 block text-xs font-medium">
            First response (h)
          </label>
          <Input
            id={`policy-first-${policy.id}`}
            type="number"
            min={0}
            step={0.5}
            value={firstHours}
            onChange={(e) => setFirstHours(e.target.value)}
            placeholder="4"
          />
        </div>
        <div className="w-28">
          <label
            htmlFor={`policy-resolution-${policy.id}`}
            className="mb-1 block text-xs font-medium"
          >
            Resolution (h)
          </label>
          <Input
            id={`policy-resolution-${policy.id}`}
            type="number"
            min={0}
            step={0.5}
            value={resolutionHours}
            onChange={(e) => setResolutionHours(e.target.value)}
            placeholder="24"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={operationalHoursOnly}
            onChange={(e) => setOperationalHoursOnly(e.target.checked)}
          />
          Count only during office hours
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <Button type="submit" size="sm" disabled={save.isPending || !name.trim()}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save policy"}
        </Button>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Breach alerts fire at 50%, 80%, and 100% of each target.
      </p>
    </form>
  );
}

function OfficeHoursForm({ hours }: { hours: OfficeHours | null }) {
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState(hours?.timezone ?? "UTC");
  const [holidays, setHolidays] = useState((hours?.holidays ?? []).join(", "));
  const [schedule, setSchedule] = useState<Record<string, { start: string; end: string }[]>>(() => {
    const base: Record<string, { start: string; end: string }[]> = {};
    for (const day of WEEKDAYS) {
      const slots = hours?.schedule[day.key];
      base[day.key] = slots?.length ? slots : [];
    }
    return base;
  });

  useEffect(() => {
    setTimezone(hours?.timezone ?? "UTC");
    setHolidays((hours?.holidays ?? []).join(", "));
    const next: Record<string, { start: string; end: string }[]> = {};
    for (const day of WEEKDAYS) {
      const slots = hours?.schedule[day.key];
      next[day.key] = slots?.length ? slots : [];
    }
    setSchedule(next);
  }, [hours]);

  const save = useMutation({
    mutationFn: () =>
      upsertOfficeHours({
        timezone: timezone.trim() || "UTC",
        schedule,
        holidays: holidays
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["office-hours"] });
    },
  });

  return (
    <form
      className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="max-w-xs">
        <label htmlFor="office-hours-timezone" className="mb-1 block text-xs font-medium">
          Timezone
        </label>
        <Input
          id="office-hours-timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="UTC"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">Weekly schedule</p>
        {WEEKDAYS.map((day) => {
          const enabled = (schedule[day.key]?.length ?? 0) > 0;
          const slot = schedule[day.key]?.[0] ?? { start: "09:00", end: "17:00" };
          return (
            <div key={day.key} className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex w-16 items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setSchedule((prev) => ({
                      ...prev,
                      [day.key]: e.target.checked ? [{ start: slot.start, end: slot.end }] : [],
                    }));
                  }}
                />
                {day.label}
              </label>
              {enabled ? (
                <>
                  <Input
                    type="time"
                    value={slot.start}
                    onChange={(e) =>
                      setSchedule((prev) => ({
                        ...prev,
                        [day.key]: [{ start: e.target.value, end: slot.end }],
                      }))
                    }
                    className="h-8 w-28"
                  />
                  <span className="text-[hsl(var(--muted-foreground))]">to</span>
                  <Input
                    type="time"
                    value={slot.end}
                    onChange={(e) =>
                      setSchedule((prev) => ({
                        ...prev,
                        [day.key]: [{ start: slot.start, end: e.target.value }],
                      }))
                    }
                    className="h-8 w-28"
                  />
                </>
              ) : (
                <span className="text-[hsl(var(--muted-foreground))]">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor="office-hours-holidays" className="mb-1 block text-xs font-medium">
          Holidays (YYYY-MM-DD, comma-separated)
        </label>
        <Input
          id="office-hours-holidays"
          value={holidays}
          onChange={(e) => setHolidays(e.target.value)}
          placeholder="2026-01-01, 2026-12-25"
        />
      </div>

      <Button type="submit" size="sm" disabled={save.isPending}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save office hours"}
      </Button>
    </form>
  );
}

export default function SlaSettingsPage() {
  const queryClient = useQueryClient();
  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ["sla-policies"],
    queryFn: listSlaPolicies,
  });
  const { data: hoursData, isLoading: hoursLoading } = useQuery({
    queryKey: ["office-hours"],
    queryFn: getOfficeHours,
  });

  const [newName, setNewName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createSlaPolicy({
        name: newName.trim(),
        firstResponseSec: 4 * 3600,
        resolutionSec: 24 * 3600,
        operationalHoursOnly: true,
        enabled: true,
      }),
    onSuccess: () => {
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["sla-policies"] });
    },
  });

  const policies = policiesData?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <SettingsNav />

        <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
          SLA policies track first response and resolution time. Breaches are recorded at 50%, 80%,
          and 100% thresholds and shown in the Inbox.
        </p>

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold">Policies</h2>
          {policiesLoading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
          ) : (
            <div className="space-y-3">
              {policies.map((policy) => (
                <PolicyRow key={policy.id} policy={policy} />
              ))}
              {policies.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No policies yet.</p>
              ) : null}
            </div>
          )}

          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="min-w-[200px] flex-1">
              <label htmlFor="new-policy-name" className="mb-1 block text-xs font-medium">
                New policy name
              </label>
              <Input
                id="new-policy-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Urgent"
              />
            </div>
            <Button type="submit" size="sm" disabled={create.isPending || !newName.trim()}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Add policy"}
            </Button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Office hours</h2>
          {hoursLoading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
          ) : (
            <OfficeHoursForm hours={hoursData?.hours ?? null} />
          )}
        </section>
      </main>
    </div>
  );
}
