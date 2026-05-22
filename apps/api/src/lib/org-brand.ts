import type { createLibsqlStore } from "@keenai/storage";
import { resolveBrandBySlug, resolveOrgBySlug } from "./widget.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export async function resolveOrgBrandBySlug(db: Db, orgSlug: string, brandSlug: string) {
  const org = await resolveOrgBySlug(db, orgSlug);
  if (!org) return { error: "org_not_found" as const };
  const brand = await resolveBrandBySlug(db, org.id, brandSlug);
  if (!brand) return { error: "brand_not_found" as const };
  return { org, brand };
}
