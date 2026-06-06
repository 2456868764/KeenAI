"use client";

import { getApiUrl } from "@/lib/portal-config";
import { useRef, useState } from "react";

type SearchHit = {
  chunkId: string;
  documentTitle: string;
  snippet: string;
  fusedScore: number;
};

type Citation = {
  chunkId: string;
  documentTitle: string;
};

export function HelpSearch({ orgSlug }: { orgSlug: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [logId, setLogId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [searched, setSearched] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  async function fetchBrandId(): Promise<string> {
    const apiUrl = getApiUrl();
    const metaRes = await fetch(`${apiUrl}/api/v1/public/${encodeURIComponent(orgSlug)}/meta`);
    const metaBody = (await metaRes.json()) as { brand?: { id: string }; error?: string };
    if (!metaRes.ok) {
      throw new Error(metaBody.error ?? `meta ${metaRes.status}`);
    }
    const brandId = metaBody.brand?.id;
    if (!brandId) throw new Error("brand_missing");
    return brandId;
  }

  function closeStream() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;

    closeStream();
    setLoading(true);
    setError(null);
    setSearched(true);
    setHits([]);
    setAnswer("");
    setCitations([]);
    setLogId(null);
    setFeedbackSent(null);

    try {
      const brandId = await fetchBrandId();
      const apiUrl = getApiUrl();
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

  async function runAiAnswer() {
    const q = query.trim();
    if (!q) return;

    closeStream();
    setAnswering(true);
    setError(null);
    setAnswer("");
    setCitations([]);
    setLogId(null);
    setFeedbackSent(null);

    try {
      const brandId = await fetchBrandId();
      const apiUrl = getApiUrl();
      const params = new URLSearchParams({ brandId, q, limit: "5", rerank: "false" });
      const url = `${apiUrl}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/answer?${params}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("meta", (event) => {
        const meta = JSON.parse(event.data) as {
          logId: string;
          citations: Citation[];
        };
        setLogId(meta.logId);
        setCitations(meta.citations ?? []);
      });

      es.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { text?: string };
        if (payload.text) {
          setAnswer((prev) => prev + payload.text);
        }
      };

      es.addEventListener("done", () => {
        closeStream();
        setAnswering(false);
      });

      es.onerror = () => {
        closeStream();
        setAnswering(false);
        setError("AI answer stream failed");
      };
    } catch (err) {
      setAnswering(false);
      setError(err instanceof Error ? err.message : "AI answer failed");
    }
  }

  async function sendFeedback(feedback: "helpful" | "not_helpful") {
    if (!logId) return;
    const apiUrl = getApiUrl();
    const res = await fetch(
      `${apiUrl}/api/v1/public/${encodeURIComponent(orgSlug)}/kb/search/${logId}/feedback`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      },
    );
    if (res.ok) setFeedbackSent(feedback);
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
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit" disabled={loading || answering || !query.trim()}>
            {loading ? "Searching…" : "Search"}
          </button>
          <button
            type="button"
            disabled={loading || answering || !query.trim()}
            onClick={() => void runAiAnswer()}
          >
            {answering ? "Generating…" : "Ask AI"}
          </button>
        </div>
      </form>
      {error ? <p className="error">{error}</p> : null}

      {answer ? (
        <div className="hc-answer" style={{ marginTop: "1rem" }}>
          <h3>AI answer</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          {citations.length > 0 ? (
            <p className="muted" style={{ fontSize: "0.875rem" }}>
              Sources: {citations.map((c) => c.documentTitle).join(" · ")}
            </p>
          ) : null}
          {logId && !feedbackSent ? (
            <p style={{ marginTop: "0.75rem" }}>
              <span className="muted">Did this help? </span>
              <button type="button" onClick={() => void sendFeedback("helpful")}>
                Yes
              </button>{" "}
              <button type="button" onClick={() => void sendFeedback("not_helpful")}>
                No
              </button>
            </p>
          ) : null}
          {feedbackSent ? <p className="muted">Thanks for your feedback.</p> : null}
        </div>
      ) : null}

      {searched && !loading && !error && hits.length === 0 && !answer ? (
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
