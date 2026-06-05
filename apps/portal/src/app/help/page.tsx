import { fetchPublicArticles, fetchPublicCollections } from "@/lib/kb-public";
import { getPortalOrgSlug, getPortalSiteUrl } from "@/lib/portal-config";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HelpSearch } from "./help-search";
import { OrgSwitcher } from "./org-switcher";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Help Center",
  description: "Browse help articles and guides.",
  openGraph: {
    title: "Help Center",
    description: "Browse help articles and guides.",
    type: "website",
  },
};

export default async function HelpCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgQuery } = await searchParams;
  const orgSlug = orgQuery?.trim() || getPortalOrgSlug();
  const [collectionsResult, articlesResult] = await Promise.all([
    fetchPublicCollections(orgSlug),
    fetchPublicArticles(orgSlug),
  ]);
  const error = collectionsResult.error ?? articlesResult.error;
  const collections = collectionsResult.items;
  const articles = articlesResult.items;
  const siteUrl = getPortalSiteUrl();

  return (
    <main>
      <h1>Help Center</h1>
      <p className="muted">Public articles (requires PORTAL_PUBLIC_READ on API).</p>

      <Suspense fallback={<p className="muted">Loading workspace…</p>}>
        <OrgSwitcher orgSlug={orgSlug} />
      </Suspense>

      {error ? <p className="error">{error}</p> : null}

      <HelpSearch orgSlug={orgSlug} />

      {collections.length > 0 ? (
        <section>
          <h2>Collections</h2>
          <ul>
            {collections.map((collection) => (
              <li key={collection.slug}>
                {collection.name} ({collection.articleCount})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>Articles</h2>
        {articles.length === 0 ? (
          <p className="muted">No public articles yet.</p>
        ) : (
          <ul>
            {articles.map((article) => (
              <li key={article.id}>
                <Link href={`/help/${article.id}?org=${encodeURIComponent(orgSlug)}`}>
                  {article.title}
                </Link>
                {article.excerpt ? <p className="muted">{article.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted" style={{ marginTop: "2rem" }}>
        <a href={`${siteUrl}/sitemap.xml`}>Sitemap</a>
      </p>
    </main>
  );
}
