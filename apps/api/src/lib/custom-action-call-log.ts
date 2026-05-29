import type { KeenaiDb } from "@keenai/storage";
import type { CustomActionLogSource, CustomActionRow } from "@keenai/storage/schema";
import { customActionLogs } from "@keenai/storage/schema";
import {
  type ExecuteCustomActionDeps,
  type ExecuteCustomActionInput,
  type ExecuteCustomActionResult,
  executeCustomActionHttpDirect,
  renderCustomActionTemplate,
} from "./custom-action-executor.js";
import { startCustomActionSpan } from "./custom-action-otel.js";

export type CustomActionCallContext = {
  orgId: string;
  brandId: string | null;
  source: CustomActionLogSource;
  triggeredBy?: string | null;
  conversationId?: string | null;
};

export type ExecuteAndLogCustomActionOptions = {
  otelEnabled?: boolean;
};

export async function persistCustomActionLog(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId: string | null;
    actionId: string;
    actionName: string;
    source: CustomActionLogSource;
    triggeredBy?: string | null;
    conversationId?: string | null;
    parameters: Record<string, unknown>;
    requestUrl: string;
    requestMethod: string;
    responseStatus: number;
    ok: boolean;
    resultData: unknown;
    filtered: boolean;
    errorCode: string | null;
    durationMs: number;
    traceId: string | null;
    spanId: string | null;
  },
): Promise<void> {
  await db.insert(customActionLogs).values({
    orgId: input.orgId,
    brandId: input.brandId,
    actionId: input.actionId,
    actionName: input.actionName,
    source: input.source,
    triggeredBy: input.triggeredBy ?? null,
    conversationId: input.conversationId ?? null,
    parameters: input.parameters,
    requestUrl: input.requestUrl,
    requestMethod: input.requestMethod,
    responseStatus: input.responseStatus,
    ok: input.ok,
    resultData: input.resultData,
    filtered: input.filtered,
    errorCode: input.errorCode,
    durationMs: input.durationMs,
    traceId: input.traceId,
    spanId: input.spanId,
  });
}

export async function executeAndLogCustomAction(
  db: KeenaiDb,
  action: CustomActionRow,
  context: CustomActionCallContext,
  input: ExecuteCustomActionInput,
  deps: ExecuteCustomActionDeps,
  options: ExecuteAndLogCustomActionOptions = {},
): Promise<ExecuteCustomActionResult> {
  const parameters = input.parameters ?? {};
  const requestUrl = renderCustomActionTemplate(action.endpoint, parameters);
  const startedAt = Date.now();
  const span = startCustomActionSpan(options.otelEnabled ?? false, "custom_action.execute", {
    "custom_action.id": action.id,
    "custom_action.name": action.name,
    "custom_action.source": context.source,
  });

  let result: ExecuteCustomActionResult | null = null;
  let errorCode: string | null = null;

  try {
    result = await executeCustomActionHttpDirect(action, input, deps);
    span.setAttribute("http.status_code", result.status);
    span.setAttribute("custom_action.ok", result.ok);
    return result;
  } catch (error) {
    errorCode = error instanceof Error ? error.message : "unknown_error";
    if (error instanceof Error) span.recordException(error);
    throw error;
  } finally {
    span.end();
    const durationMs = Date.now() - startedAt;
    try {
      await persistCustomActionLog(db, {
        orgId: context.orgId,
        brandId: context.brandId,
        actionId: action.id,
        actionName: action.name,
        source: context.source,
        triggeredBy: context.triggeredBy,
        conversationId: context.conversationId,
        parameters,
        requestUrl: result?.url ?? requestUrl,
        requestMethod: result?.method ?? action.method,
        responseStatus: result?.status ?? 0,
        ok: result?.ok ?? false,
        resultData: result?.data ?? null,
        filtered: result?.filtered ?? false,
        errorCode,
        durationMs,
        traceId: span.traceId,
        spanId: span.spanId,
      });
    } catch {
      // Logging must not break action execution.
    }
  }
}
