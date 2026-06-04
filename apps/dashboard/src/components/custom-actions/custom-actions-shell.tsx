"use client";

import { AppHeader } from "@/components/layout/app-header";
import { createCustomAction, fetchMe, listCustomActionLogs, listCustomActions } from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

type WizardStep = 1 | 2 | 3 | 4;

const defaultForm = {
  name: "",
  description: "",
  whenToUse: "",
  endpoint: "https://httpbin.org/post",
  method: "POST" as const,
  authType: "none" as const,
  sandbox: "http_direct" as const,
};

export function CustomActionsShell() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState(defaultForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const listQuery = useQuery({
    queryKey: ["custom-actions", brandId],
    queryFn: () => listCustomActions(brandId as string),
    enabled: Boolean(brandId),
  });

  const logsQuery = useQuery({
    queryKey: ["custom-action-logs", selectedId],
    queryFn: () => listCustomActionLogs(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const create = useMutation({
    mutationFn: () =>
      createCustomAction({
        brandId: brandId as string,
        name: form.name,
        description: form.description || undefined,
        whenToUse: form.whenToUse || undefined,
        endpoint: form.endpoint,
        method: form.method,
        authType: form.authType,
        sandbox: form.sandbox,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-actions"] });
      setForm(defaultForm);
      setStep(1);
    },
  });

  const items = listQuery.data?.items ?? [];
  const selected = useMemo(
    () => items.find((a) => a.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Custom Actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!brandId}
          onClick={() => {
            setForm(defaultForm);
            setStep(1);
          }}
        >
          <Plus className="mr-1 size-4" />
          New action
        </Button>
      </AppHeader>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
          <h2 className="mb-3 text-sm font-medium">Actions</h2>
          {!brandId ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading brand…</p>
          ) : listQuery.isLoading ? (
            <Loader2 className="size-5 animate-spin text-[hsl(var(--muted-foreground))]" />
          ) : items.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No custom actions yet.</p>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {items.map((action) => (
                <li key={action.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left hover:bg-[hsl(var(--surface-2))]"
                    onClick={() => setSelectedId(action.id)}
                  >
                    <span className="font-mono text-sm">{action.name}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {action.method} · {action.sandbox}
                      {action.enabled ? "" : " · disabled"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
            <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
              4-step wizard (I109 stub): basics → endpoint → auth → review
            </p>
            <div className="mb-4 flex gap-2 text-xs">
              {([1, 2, 3, 4] as WizardStep[]).map((n) => (
                <span
                  key={n}
                  className={
                    step === n
                      ? "rounded bg-[hsl(var(--primary))] px-2 py-0.5 text-[hsl(var(--primary-foreground))]"
                      : "rounded bg-[hsl(var(--surface-2))] px-2 py-0.5"
                  }
                >
                  {n}
                </span>
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-2">
                <label className="block text-xs" htmlFor="ca-name">
                  Name (snake_case)
                </label>
                <input
                  id="ca-name"
                  className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="lookup_order"
                />
                <label className="block text-xs" htmlFor="ca-desc">
                  Description
                </label>
                <textarea
                  id="ca-desc"
                  className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <label className="block text-xs" htmlFor="ca-endpoint">
                  Endpoint URL
                </label>
                <input
                  id="ca-endpoint"
                  className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
                  value={form.endpoint}
                  onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                />
                <label className="block text-xs" htmlFor="ca-method">
                  Method
                </label>
                <select
                  id="ca-method"
                  className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, method: e.target.value as typeof form.method }))
                  }
                >
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <label className="block text-xs" htmlFor="ca-auth">
                  Auth type
                </label>
                <select
                  id="ca-auth"
                  className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
                  value={form.authType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, authType: e.target.value as typeof form.authType }))
                  }
                >
                  <option value="none">none</option>
                  <option value="bearer">bearer</option>
                  <option value="hmac">hmac</option>
                  <option value="basic">basic</option>
                </select>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Sandbox: http_direct only in this UI; workers / isolated_vm via API.
                </p>
              </div>
            )}

            {step === 4 && (
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-xs text-[hsl(var(--muted-foreground))]">Name</dt>
                  <dd className="font-mono">{form.name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[hsl(var(--muted-foreground))]">Endpoint</dt>
                  <dd className="break-all">
                    {form.method} {form.endpoint}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[hsl(var(--muted-foreground))]">Auth</dt>
                  <dd>{form.authType}</dd>
                </div>
              </dl>
            )}

            <div className="mt-4 flex gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setStep((step - 1) as WizardStep)}
                >
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button type="button" size="sm" onClick={() => setStep((step + 1) as WizardStep)}>
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={!brandId || !form.name || create.isPending}
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create action"}
                </Button>
              )}
            </div>
            {create.error && (
              <p className="mt-2 text-xs text-red-400">{(create.error as Error).message}</p>
            )}
          </div>

          {selected && (
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
              <h3 className="mb-2 text-sm font-medium">Call logs · {selected.name}</h3>
              {logsQuery.isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (logsQuery.data?.items.length ?? 0) === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">No calls yet.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {logsQuery.data?.items.map((log) => (
                    <li key={log.id} className="rounded bg-[hsl(var(--surface-2))] p-2">
                      <span className={log.ok ? "text-green-500" : "text-red-400"}>
                        {log.responseStatus ?? "—"}
                      </span>{" "}
                      · {log.durationMs}ms · {new Date(log.createdAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
