import { signCustomActionRequest } from "@keenai/auth";
import type { CustomActionRow } from "@keenai/storage/schema";

export const CUSTOM_ACTION_MAX_RESPONSE_BYTES = 20_000;
export const CUSTOM_ACTION_DEFAULT_TIMEOUT_MS = 10_000;

export type CustomActionFetch = typeof fetch;

export type ExecuteCustomActionInput = {
  parameters?: Record<string, unknown>;
  timeoutMs?: number;
};

export type ExecuteCustomActionDeps = {
  fetch: CustomActionFetch;
  getSecret: (secretRef: string) => string | null;
  now?: () => number;
};

export type ExecuteCustomActionResult = {
  ok: boolean;
  status: number;
  url: string;
  method: string;
  data: unknown;
  rawBody: string;
  filtered: boolean;
};

export function renderCustomActionTemplate(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) return "";
    return encodeURIComponent(String(value));
  });
}

export function filterCustomActionResponse(
  data: unknown,
  dataAccess: Record<string, unknown>,
): { data: unknown; filtered: boolean } {
  const allowFields = dataAccess.allowFields;
  if (!Array.isArray(allowFields) || allowFields.length === 0) {
    return { data, filtered: false };
  }
  if (typeof data !== "object" || data === null) {
    return { data, filtered: false };
  }

  const source = data as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const field of allowFields) {
    if (typeof field === "string" && field in source) {
      filtered[field] = source[field];
    }
  }
  return { data: filtered, filtered: true };
}

function buildRequestBody(
  method: CustomActionRow["method"],
  parameters: Record<string, unknown>,
): string | undefined {
  if (method === "GET") return undefined;
  return JSON.stringify(parameters);
}

function parseResponseBody(rawBody: string): unknown {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function buildAuthHeaders(
  action: CustomActionRow,
  input: { method: string; url: string; body?: string },
  deps: ExecuteCustomActionDeps,
): Record<string, string> {
  if (action.authType === "none") return {};

  const secretRef = action.authSecretRef;
  if (!secretRef) {
    throw new Error("auth_secret_missing");
  }

  const secret = deps.getSecret(secretRef);
  if (!secret) {
    throw new Error("auth_secret_unavailable");
  }

  if (action.authType === "bearer") {
    return { Authorization: `Bearer ${secret}` };
  }

  if (action.authType === "basic") {
    const encoded = Buffer.from(secret, "utf8").toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }

  if (action.authType === "hmac") {
    const signed = signCustomActionRequest({
      secret,
      method: input.method,
      url: input.url,
      body: input.body,
      timestamp: deps.now ? Math.floor(deps.now() / 1000) : undefined,
    });
    return { [signed.headerName]: signed.headerValue };
  }

  throw new Error("auth_type_unsupported");
}

/** Execute a stored custom action via the default HTTP Direct sandbox. */
export async function executeCustomActionHttpDirect(
  action: CustomActionRow,
  input: ExecuteCustomActionInput,
  deps: ExecuteCustomActionDeps,
): Promise<ExecuteCustomActionResult> {
  if (!action.enabled) {
    throw new Error("action_disabled");
  }
  if (action.sandbox !== "http_direct") {
    throw new Error("sandbox_not_supported");
  }

  const parameters = input.parameters ?? {};
  const url = renderCustomActionTemplate(action.endpoint, parameters);
  const method = action.method;
  const body = buildRequestBody(method, parameters);
  const authHeaders = buildAuthHeaders(action, { method, url, body }, deps);
  const headers = {
    ...action.headers,
    ...authHeaders,
    ...(body ? { "Content-Type": "application/json" } : {}),
  };

  const response = await deps.fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(input.timeoutMs ?? CUSTOM_ACTION_DEFAULT_TIMEOUT_MS),
  });

  const rawBody = await response.text();
  if (rawBody.length > CUSTOM_ACTION_MAX_RESPONSE_BYTES) {
    throw new Error("response_too_large");
  }

  const parsed = parseResponseBody(rawBody);
  const filtered = filterCustomActionResponse(parsed, action.dataAccess);

  return {
    ok: response.ok,
    status: response.status,
    url,
    method,
    data: filtered.data,
    rawBody,
    filtered: filtered.filtered,
  };
}

export function resolveCustomActionSecretFromEnv(
  secretRef: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (secretRef.startsWith("env:")) {
    return env[secretRef.slice(4)] ?? null;
  }

  const slug = secretRef.replace(/^vault:/, "");
  const envKey = `CUSTOM_ACTION_SECRET_${slug.replace(/-/g, "_").toUpperCase()}`;
  return env[envKey] ?? env[secretRef] ?? null;
}
