"use client";

import { McpPanel } from "@/components/custom-actions/mcp-panel";
import { AppHeader } from "@/components/layout/app-header";
import {
  type CustomAction,
  createCustomAction,
  deleteCustomAction,
  executeCustomAction,
  fetchMe,
  listCustomActionLogs,
  listCustomActions,
  updateCustomAction,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

type WizardStep = 1 | 2 | 3 | 4;

const defaultParametersSchema = '{\n  "type": "object",\n  "properties": {}\n}';

const defaultForm = {
  name: "",
  description: "",
  whenToUse: "",
  endpoint: "https://httpbin.org/post",
  method: "POST" as const,
  authType: "none" as const,
  authSecretRef: "",
  sandbox: "http_direct" as const,
  parametersSchemaText: defaultParametersSchema,
  enabled: true,
};

function parseParametersSchema(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

export function CustomActionsShell() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState(defaultForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testParams, setTestParams] = useState("{}");
  const [showWizard, setShowWizard] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

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
    mutationFn: () => {
      const parametersSchema = parseParametersSchema(form.parametersSchemaText);
      return createCustomAction({
        brandId: brandId as string,
        name: form.name,
        description: form.description || undefined,
        whenToUse: form.whenToUse || undefined,
        parametersSchema,
        endpoint: form.endpoint,
        method: form.method,
        authType: form.authType,
        authSecretRef: form.authSecretRef || undefined,
        sandbox: form.sandbox,
        enabled: form.enabled,
      });
    },
    onSuccess: ({ action }) => {
      void queryClient.invalidateQueries({ queryKey: ["custom-actions"] });
      setForm(defaultForm);
      setStep(1);
      setShowWizard(false);
      setSelectedId(action.id);
    },
  });

  const saveSelected = useMutation({
    mutationFn: (patch: Partial<CustomAction> & { parametersSchema?: Record<string, unknown> }) =>
      updateCustomAction(selectedId as string, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["custom-actions"] }),
  });

  const remove = useMutation({
    mutationFn: () => deleteCustomAction(selectedId as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-actions"] });
      setSelectedId(null);
    },
  });

  const testRun = useMutation({
    mutationFn: () =>
      executeCustomAction(selectedId as string, {
        parameters: JSON.parse(testParams) as Record<string, unknown>,
      }),
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
            setShowWizard(true);
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
                    className={`flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left hover:bg-[hsl(var(--surface-2))] ${
                      selectedId === action.id ? "bg-[hsl(var(--surface-2))]" : ""
                    }`}
                    onClick={() => {
                      setSelectedId(action.id);
                      setShowWizard(false);
                    }}
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
          {showWizard ? (
            <WizardPanel
              step={step}
              form={form}
              schemaError={schemaError}
              creating={create.isPending}
              createError={create.error as Error | null}
              onStep={setStep}
              onChange={setForm}
              onCreate={() => {
                try {
                  parseParametersSchema(form.parametersSchemaText);
                  setSchemaError(null);
                  create.mutate();
                } catch {
                  setSchemaError("Parameters schema must be valid JSON.");
                }
              }}
              onCancel={() => setShowWizard(false)}
            />
          ) : selected ? (
            <ActionDetailPanel
              action={selected}
              testParams={testParams}
              logs={logsQuery.data?.items ?? []}
              logsLoading={logsQuery.isLoading}
              saving={saveSelected.isPending}
              testing={testRun.isPending}
              testResult={testRun.data?.result}
              testError={testRun.error as Error | null}
              onTestParams={setTestParams}
              onToggleEnabled={() => saveSelected.mutate({ enabled: !selected.enabled })}
              onDelete={() => remove.mutate()}
              deleting={remove.isPending}
              onRunTest={() => testRun.mutate()}
            />
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Select an action or create a new one.
            </p>
          )}

          <McpPanel />
        </section>
      </main>
    </div>
  );
}

function WizardPanel({
  step,
  form,
  schemaError,
  creating,
  createError,
  onStep,
  onChange,
  onCreate,
  onCancel,
}: {
  step: WizardStep;
  form: typeof defaultForm;
  schemaError: string | null;
  creating: boolean;
  createError: Error | null;
  onStep: (step: WizardStep) => void;
  onChange: (form: typeof defaultForm) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
        4-step wizard: basics → endpoint → auth & sandbox → review
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
          <Field label="Name (snake_case)" id="ca-name">
            <Input
              id="ca-name"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="lookup_order"
            />
          </Field>
          <Field label="Description" id="ca-desc">
            <textarea
              id="ca-desc"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
              rows={2}
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="When to use (agent hint)" id="ca-when">
            <textarea
              id="ca-when"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
              rows={2}
              value={form.whenToUse}
              onChange={(e) => onChange({ ...form, whenToUse: e.target.value })}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <Field label="Endpoint URL" id="ca-endpoint">
            <Input
              id="ca-endpoint"
              value={form.endpoint}
              onChange={(e) => onChange({ ...form, endpoint: e.target.value })}
            />
          </Field>
          <Field label="Method" id="ca-method">
            <select
              id="ca-method"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
              value={form.method}
              onChange={(e) => onChange({ ...form, method: e.target.value as typeof form.method })}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parameters schema (JSON Schema)" id="ca-schema">
            <textarea
              id="ca-schema"
              className="min-h-[120px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 font-mono text-xs"
              value={form.parametersSchemaText}
              onChange={(e) => onChange({ ...form, parametersSchemaText: e.target.value })}
            />
          </Field>
          {schemaError ? <p className="text-xs text-red-400">{schemaError}</p> : null}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <Field label="Auth type" id="ca-auth">
            <select
              id="ca-auth"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
              value={form.authType}
              onChange={(e) =>
                onChange({ ...form, authType: e.target.value as typeof form.authType })
              }
            >
              <option value="none">none</option>
              <option value="bearer">bearer</option>
              <option value="hmac">hmac</option>
              <option value="basic">basic</option>
            </select>
          </Field>
          <Field label="Secret ref (env:VAR or vault slug)" id="ca-secret">
            <Input
              id="ca-secret"
              value={form.authSecretRef}
              onChange={(e) => onChange({ ...form, authSecretRef: e.target.value })}
              placeholder="env:MY_API_TOKEN"
            />
          </Field>
          <Field label="Sandbox" id="ca-sandbox">
            <select
              id="ca-sandbox"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-sm"
              value={form.sandbox}
              onChange={(e) =>
                onChange({ ...form, sandbox: e.target.value as typeof form.sandbox })
              }
            >
              <option value="http_direct">http_direct (supported)</option>
              <option value="workers">workers (configure only)</option>
              <option value="isolated_vm">isolated_vm (configure only)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => onChange({ ...form, enabled: e.target.checked })}
            />
            Enabled for copilot
          </label>
        </div>
      )}

      {step === 4 && (
        <dl className="space-y-1 text-sm">
          <Row label="Name" value={form.name || "—"} mono />
          <Row label="Endpoint" value={`${form.method} ${form.endpoint}`} />
          <Row label="Auth" value={form.authType} />
          <Row label="Sandbox" value={form.sandbox} />
        </dl>
      )}

      <div className="mt-4 flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {step > 1 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onStep((step - 1) as WizardStep)}
          >
            Back
          </Button>
        )}
        {step < 4 ? (
          <Button type="button" size="sm" onClick={() => onStep((step + 1) as WizardStep)}>
            Next
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!form.name || creating} onClick={onCreate}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : "Create action"}
          </Button>
        )}
      </div>
      {createError ? <p className="mt-2 text-xs text-red-400">{createError.message}</p> : null}
    </div>
  );
}

function ActionDetailPanel({
  action,
  testParams,
  logs,
  logsLoading,
  saving,
  testing,
  testResult,
  testError,
  onTestParams,
  onToggleEnabled,
  onDelete,
  deleting,
  onRunTest,
}: {
  action: CustomAction;
  testParams: string;
  logs: Array<{
    id: string;
    ok: boolean;
    responseStatus: number | null;
    durationMs: number | null;
    createdAt: string;
  }>;
  logsLoading: boolean;
  saving: boolean;
  testing: boolean;
  testResult?: { ok: boolean; status: number; data: unknown };
  testError: Error | null;
  onTestParams: (value: string) => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  deleting: boolean;
  onRunTest: () => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-mono text-sm font-medium">{action.name}</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {action.method} · {action.sandbox} · {action.enabled ? "enabled" : "disabled"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={onToggleEnabled}
            >
              {action.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {action.description ? (
          <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">{action.description}</p>
        ) : null}
        <p className="break-all font-mono text-xs">{action.endpoint}</p>
      </div>

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h3 className="mb-2 text-sm font-medium">Sandbox test (http_direct)</h3>
        <textarea
          className="mb-2 min-h-[80px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 font-mono text-xs"
          value={testParams}
          onChange={(e) => onTestParams(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={testing || action.sandbox !== "http_direct"}
          onClick={onRunTest}
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : "Run test"}
        </Button>
        {action.sandbox !== "http_direct" ? (
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            Execute sandbox supports http_direct only; workers/isolated_vm are stored for future
            runtime.
          </p>
        ) : null}
        {testResult ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-[hsl(var(--surface-2))] p-2 text-xs">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        ) : null}
        {testError ? <p className="mt-2 text-xs text-red-400">{testError.message}</p> : null}
      </div>

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h3 className="mb-2 text-sm font-medium">Call logs</h3>
        {logsLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : logs.length === 0 ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">No calls yet.</p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
            {logs.map((log) => (
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
    </>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className={mono ? "font-mono" : "break-all"}>{value}</dd>
    </div>
  );
}
