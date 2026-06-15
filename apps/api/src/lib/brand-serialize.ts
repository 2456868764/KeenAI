import { parseBrandPersonality } from "@keenai/shared";
import type { brands } from "@keenai/storage/schema";

type BrandSettings = {
  personality?: unknown;
};

export function serializeBrand(row: typeof brands.$inferSelect) {
  const settings = (row.settings ?? {}) as BrandSettings;
  return {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    name: row.name,
    domain: row.domain ?? null,
    logoUrl: row.logoUrl ?? null,
    locale: row.locale ?? "en",
    emailFrom: row.emailFrom ?? null,
    personality: parseBrandPersonality(settings.personality, row.name),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mergeBrandSettings(
  existing: Record<string, unknown>,
  patch: { personality?: Record<string, unknown> },
): Record<string, unknown> {
  const next = { ...existing };
  if (patch.personality !== undefined) {
    const current = parseBrandPersonality(existing.personality);
    const voicePatch =
      patch.personality.voice && typeof patch.personality.voice === "object"
        ? (patch.personality.voice as Record<string, unknown>)
        : {};
    const languagePatch =
      patch.personality.language && typeof patch.personality.language === "object"
        ? (patch.personality.language as Record<string, unknown>)
        : {};
    next.personality = parseBrandPersonality({
      ...current,
      ...patch.personality,
      voice: { ...current.voice, ...voicePatch },
      language: { ...current.language, ...languagePatch },
    });
  }
  return next;
}
