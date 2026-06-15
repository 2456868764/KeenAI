import type { BrandPersonality } from "@keenai/shared";
import { parseBrandPersonality } from "@keenai/shared";
import { brands } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";

type Db = AppVariables["store"]["db"];

type BrandSettings = {
  personality?: unknown;
};

export async function loadBrandPersonality(
  db: Db,
  input: { orgId: string; brandId: string },
): Promise<BrandPersonality> {
  const [row] = await db
    .select({
      name: brands.name,
      settings: brands.settings,
    })
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.orgId, input.orgId)))
    .limit(1);

  if (!row) {
    return parseBrandPersonality(null);
  }

  const settings = (row.settings ?? {}) as BrandSettings;
  return parseBrandPersonality(settings.personality, row.name);
}
