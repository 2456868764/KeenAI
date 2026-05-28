import type { CustomActionRow } from "@keenai/storage/schema";

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
