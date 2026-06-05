import { getApiUrl } from "./portal-config";

export type PublicKbCollection = { slug: string; name: string; articleCount: number };

export type PublicKbArticle = {
  id: string;
  title: string;
  slug: string;
  collection: string;
  excerpt: string | null;
  updatedAt: string;
};

export type PublicKbArticleDetail = PublicKbArticle & {
  body: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

const REVALIDATE_SEC = 60;

export async function fetchPublicCollections(
  orgSlug: string,
): Promise<{ items: PublicKbCollection[]; error?: string }> {
  const res = await fetch(
    `${getApiUrl()}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/collections`,
    { next: { revalidate: REVALIDATE_SEC } },
  );
  const body = (await res.json()) as { items?: PublicKbCollection[]; error?: string };
  if (!res.ok) {
    return { items: [], error: body.error ?? `collections ${res.status}` };
  }
  return { items: body.items ?? [] };
}

export async function fetchPublicArticles(
  orgSlug: string,
  collection?: string,
): Promise<{ items: PublicKbArticle[]; error?: string }> {
  const params = new URLSearchParams();
  if (collection) params.set("collection", collection);
  const query = params.toString();
  const res = await fetch(
    `${getApiUrl()}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/articles${query ? `?${query}` : ""}`,
    { next: { revalidate: REVALIDATE_SEC } },
  );
  const body = (await res.json()) as { items?: PublicKbArticle[]; error?: string };
  if (!res.ok) {
    return { items: [], error: body.error ?? `articles ${res.status}` };
  }
  return { items: body.items ?? [] };
}

export async function fetchPublicArticle(
  orgSlug: string,
  id: string,
): Promise<PublicKbArticleDetail | null> {
  const res = await fetch(
    `${getApiUrl()}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/articles/${encodeURIComponent(id)}`,
    { next: { revalidate: REVALIDATE_SEC } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { article: PublicKbArticleDetail };
  return body.article;
}
