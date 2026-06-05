import { getPortalOrgSlugFromEnv, getPortalSiteUrlFromEnv } from "@keenai/shared/help-center-seo";

export function getPortalSiteUrl(): string {
  return getPortalSiteUrlFromEnv();
}

export function getPortalOrgSlug(): string {
  return getPortalOrgSlugFromEnv();
}

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
}
