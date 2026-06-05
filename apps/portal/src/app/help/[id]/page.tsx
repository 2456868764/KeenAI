import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type Article = {
  id: string;
  title: string;
  body: string;
  collection: string;
  excerpt: string | null;
  updatedAt: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

async function fetchArticle(orgSlug: string, id: string): Promise<Article | null> {
  const res = await fetch(
    `${API_URL}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/articles/${encodeURIComponent(id)}`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { article: Article };
  return body.article;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { org = "demo" } = await searchParams;
  const article = await fetchArticle(org, id);
  if (!article) return { title: "Article not found" };
  const title = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? article.excerpt ?? article.body.slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description },
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
  const { org = "demo" } = await searchParams;
  const article = await fetchArticle(org, id);

  if (!article) {
    return (
      <main>
        <p>Article not found.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <a href="/help">← Help Center</a>
      </p>
      <article>
        <p className="muted">{article.collection}</p>
        <h1>{article.title}</h1>
        <p className="muted">Updated {new Date(article.updatedAt).toLocaleString()}</p>
        <div style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>{article.body}</div>
      </article>
    </main>
  );
}
