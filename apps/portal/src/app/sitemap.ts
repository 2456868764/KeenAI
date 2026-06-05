import { fetchPublicArticles } from "@/lib/kb-public";
import { getPortalOrgSlug, getPortalSiteUrl } from "@/lib/portal-config";
import { buildHelpCenterSitemapEntries } from "@keenai/shared/help-center-seo";
import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const orgSlug = getPortalOrgSlug();
  const siteUrl = getPortalSiteUrl();
  const { items } = await fetchPublicArticles(orgSlug);
  return buildHelpCenterSitemapEntries(siteUrl, items);
}
