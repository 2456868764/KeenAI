import { fetchPublicArticle } from "@/lib/kb-public";
import { getPortalOrgSlug, getPortalSiteUrl } from "@/lib/portal-config";
import { buildArticleJsonLd } from "@keenai/shared/help-center-seo";
import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 60;

async function resolveOrg(searchParams: Promise<{ org?: string }>): Promise<string> {
  const { org } = await searchParams;
  return org?.trim() || getPortalOrgSlug();
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const orgSlug = await resolveOrg(searchParams);
  const article = await fetchPublicArticle(orgSlug, id);
  if (!article) return { title: "Article not found" };

  const siteUrl = getPortalSiteUrl();
  const title = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? article.excerpt ?? article.body.slice(0, 160);
  const pageUrl = `${siteUrl}/help/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: pageUrl,
      modifiedTime: article.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: { canonical: pageUrl },
  };
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
  const orgSlug = await resolveOrg(searchParams);
  const article = await fetchPublicArticle(orgSlug, id);
  const siteUrl = getPortalSiteUrl();

  if (!article) {
    return (
      <main>
        <p>Article not found.</p>
      </main>
    );
  }

  const pageUrl = `${siteUrl}/help/${id}`;
  const jsonLd = buildArticleJsonLd({
    url: pageUrl,
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.excerpt ?? article.body.slice(0, 160),
    updatedAt: article.updatedAt,
    collection: article.collection,
  });

  return (
    <main>
      <p>
        <Link href={`/help?org=${encodeURIComponent(orgSlug)}`}>← Help Center</Link>
      </p>
      <article>
        <p className="muted">{article.collection}</p>
        <h1>{article.title}</h1>
        <p className="muted">Updated {new Date(article.updatedAt).toLocaleString()}</p>
        <div style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>{article.body}</div>
      </article>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </main>
  );
}
