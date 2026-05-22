import type { PortalAccessClaims } from "@keenai/auth";
import type { Context } from "hono";
import type { AppContext, AppVariables } from "../types.js";

type PortalContext = Context<{ Variables: AppVariables }>;

export function resolvePortalCustomerId(
  c: PortalContext,
  ctx: AppContext,
  queryCustomerId?: string,
): string | null {
  const portalAuth = c.get("portalAuth");
  const orgSlug = c.req.param("orgSlug");

  if (portalAuth && portalAuth.orgSlug === orgSlug) {
    return portalAuth.sub;
  }

  if (ctx.env.PORTAL_PUBLIC_READ && queryCustomerId) {
    return queryCustomerId;
  }

  return null;
}

export function assertPortalOrgMatch(
  portalAuth: PortalAccessClaims | null,
  orgSlug: string,
): boolean {
  return !!portalAuth && portalAuth.orgSlug === orgSlug;
}
