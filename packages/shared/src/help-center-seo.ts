export type HelpCenterSitemapArticle = {
  id: string;
  updatedAt?: string | Date;
};

export type HelpCenterSitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency: "weekly";
  priority: number;
};

export function getPortalOrgSlugFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  return env.NEXT_PUBLIC_PORTAL_ORG_SLUG ?? env.PORTAL_ORG_SLUG ?? "demo";
}

export function getPortalSiteUrlFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const raw = env.NEXT_PUBLIC_PORTAL_URL ?? env.PORTAL_APP_URL ?? "http://localhost:3002";
  return raw.replace(/\/$/, "");
}

export function buildHelpCenterSitemapEntries(
  siteUrl: string,
  articles: HelpCenterSitemapArticle[],
): HelpCenterSitemapEntry[] {
  const base = siteUrl.replace(/\/$/, "");
  const entries: HelpCenterSitemapEntry[] = [
    {
      url: `${base}/help`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  for (const article of articles) {
    const lastModified =
      article.updatedAt instanceof Date
        ? article.updatedAt
        : article.updatedAt
          ? new Date(article.updatedAt)
          : undefined;
    entries.push({
      url: `${base}/help/${encodeURIComponent(article.id)}`,
      lastModified:
        lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}

export function buildArticleJsonLd(input: {
  url: string;
  title: string;
  description: string;
  updatedAt: string;
  collection?: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    dateModified: input.updatedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    ...(input.collection
      ? {
          articleSection: input.collection,
          isPartOf: { "@type": "WebPage", name: input.collection },
        }
      : {}),
  };
}
