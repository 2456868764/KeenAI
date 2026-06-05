"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type Collection = { slug: string; name: string; articleCount: number };
type Article = {
  id: string;
  title: string;
  slug: string;
  collection: string;
  excerpt: string | null;
};

export default function HelpCenterPage() {
  const [orgSlug, setOrgSlug] = useState("demo");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const [colRes, artRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/collections`),
          fetch(`${API_URL}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/articles`),
        ]);
        const colBody = (await colRes.json()) as { items?: Collection[]; error?: string };
        const artBody = (await artRes.json()) as { items?: Article[]; error?: string };
        if (!colRes.ok) throw new Error(colBody.error ?? `collections ${colRes.status}`);
        if (!artRes.ok) throw new Error(artBody.error ?? `articles ${artRes.status}`);
        setCollections(colBody.items ?? []);
        setArticles(artBody.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        setCollections([]);
        setArticles([]);
      }
    }
    void load();
  }, [orgSlug]);

  return (
    <main>
      <h1>Help Center</h1>
      <p className="muted">Public articles (requires PORTAL_PUBLIC_READ on API).</p>

      <label htmlFor="org">Workspace</label>
      <input id="org" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} />

      {error ? <p className="error">{error}</p> : null}

      {collections.length > 0 ? (
        <section>
          <h2>Collections</h2>
          <ul>
            {collections.map((c) => (
              <li key={c.slug}>
                {c.name} ({c.articleCount})
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
                <Link href={`/help/${article.id}`}>{article.title}</Link>
                {article.excerpt ? <p className="muted">{article.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
