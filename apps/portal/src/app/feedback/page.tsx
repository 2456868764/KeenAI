"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type FeedbackPost = {
  id: string;
  title: string;
  plainText: string;
  statusName: string | null;
  upvoteCount: number;
};

export default function PortalFeedbackPage() {
  const [orgSlug, setOrgSlug] = useState("demo");
  const [items, setItems] = useState<FeedbackPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/public/${encodeURIComponent(orgSlug)}/feedback/ideas/posts`,
        );
        const body = (await res.json()) as { items?: FeedbackPost[]; error?: string };
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
      <h1>Product feedback</h1>
      <p className="muted">Public ideas board (requires PORTAL_PUBLIC_READ on API).</p>

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
        {items.map((post) => (
          <li key={post.id}>
            <strong>{post.title}</strong>
            <div className="muted">
              {post.statusName ?? "Open"} · ▲ {post.upvoteCount}
            </div>
            <p>{post.plainText}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
