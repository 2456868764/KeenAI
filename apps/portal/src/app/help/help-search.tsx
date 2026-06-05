"use client";

import { getApiUrl } from "@/lib/portal-config";
import { useState } from "react";

type SearchHit = {
  chunkId: string;
  documentTitle: string;
  snippet: string;
  fusedScore: number;
};

export function HelpSearch({ orgSlug }: { orgSlug: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    setHits([]);

    try {
      const apiUrl = getApiUrl();
      const metaRes = await fetch(`${apiUrl}/api/v1/public/${encodeURIComponent(orgSlug)}/meta`);
      const metaBody = (await metaRes.json()) as {
        brand?: { id: string };
        error?: string;
      };
      if (!metaRes.ok) {
        throw new Error(metaBody.error ?? `meta ${metaRes.status}`);
      }
      const brandId = metaBody.brand?.id;
      if (!brandId) throw new Error("brand_missing");

      const params = new URLSearchParams({ brandId, q, limit: "8", rerank: "false" });
      const searchRes = await fetch(
        `${apiUrl}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/search?${params}`,
      );
      const searchBody = (await searchRes.json()) as {
        results?: { hits: SearchHit[] };
        error?: string;
      };
      if (!searchRes.ok) {
        throw new Error(searchBody.error ?? `search ${searchRes.status}`);
      }
      setHits(searchBody.results?.hits ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ margin: "1.5rem 0" }}>
      <h2>Search</h2>
      <form onSubmit={(event) => void runSearch(event)}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help articles…"
          aria-label="Search help articles"
        />
        <button type="submit" disabled={loading || !query.trim()} style={{ marginTop: "0.5rem" }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {searched && !loading && !error && hits.length === 0 ? (
        <p className="muted">No results found.</p>
      ) : null}
      {hits.length > 0 ? (
        <ul>
          {hits.map((hit) => (
            <li key={hit.chunkId}>
              <strong>{hit.documentTitle}</strong>
              <p className="muted">{hit.snippet}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
