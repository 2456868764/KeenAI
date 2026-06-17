"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type ChangelogEntry = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  plainText: string;
  categoryTags: string[];
  publishedAt: string | null;
};

export default function PortalChangelogPage() {
  const [orgSlug, setOrgSlug] = useState("demo");
  const [items, setItems] = useState<ChangelogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/public/${encodeURIComponent(orgSlug)}/changelog/entries`,
        );
        const body = (await res.json()) as { items?: ChangelogEntry[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setItems(body.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [orgSlug]);

  return (
    <main>
      <h1>Product updates</h1>
      <p className="muted">Public changelog (requires PORTAL_PUBLIC_READ on API).</p>

      <label htmlFor="org">Workspace</label>
      <input
        id="org"
        value={orgSlug}
        onChange={(e) => setOrgSlug(e.target.value)}
        placeholder="demo"
      />

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <ul>
        {items.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.title}</strong>
            <div className="muted">
              {entry.categoryTags.join(" · ") || "Update"}
              {entry.publishedAt ? ` · ${new Date(entry.publishedAt).toLocaleDateString()}` : ""}
            </div>
            {entry.summary ? <p>{entry.summary}</p> : null}
            <p>{entry.plainText}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
