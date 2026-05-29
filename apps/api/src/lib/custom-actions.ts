import type { CustomActionLogRow, CustomActionRow } from "@keenai/storage/schema";

export function serializeCustomAction(row: CustomActionRow) {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    name: row.name,
    description: row.description,
    whenToUse: row.whenToUse,
    parametersSchema: row.parametersSchema,
    endpoint: row.endpoint,
    method: row.method,
    headers: row.headers,
    authType: row.authType,
    authSecretRef: row.authSecretRef,
    dataAccess: row.dataAccess,
    sandbox: row.sandbox,
    enabled: row.enabled,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("unique") || message.includes("constraint");
}

export function serializeCustomActionLog(row: CustomActionLogRow) {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    actionId: row.actionId,
    actionName: row.actionName,
    source: row.source,
    triggeredBy: row.triggeredBy,
    conversationId: row.conversationId,
    parameters: row.parameters,
    requestUrl: row.requestUrl,
    requestMethod: row.requestMethod,
    responseStatus: row.responseStatus,
    ok: row.ok,
    resultData: row.resultData,
    filtered: row.filtered,
    errorCode: row.errorCode,
    durationMs: row.durationMs,
    traceId: row.traceId,
    spanId: row.spanId,
    createdAt: row.createdAt.toISOString(),
  };
}
