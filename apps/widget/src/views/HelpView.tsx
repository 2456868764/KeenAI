import { useMemo, useState } from "preact/hooks";
import type { WidgetHelpArticle, WidgetHelpArticleDetail, WidgetHelpCollection } from "../types.js";

type HelpViewProps = {
  collections: WidgetHelpCollection[];
  articles: WidgetHelpArticle[];
  onLoadArticle: (articleId: string) => Promise<WidgetHelpArticleDetail>;
  onStartChat: () => void;
};

export function HelpView({ collections, articles, onLoadArticle, onStartChat }: HelpViewProps) {
  const [query, setQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<WidgetHelpArticleDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return articles;
    return articles.filter((article) =>
      `${article.title} ${article.excerpt ?? ""} ${article.collection}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [articles, query]);

  async function openArticle(articleId: string) {
    setDetailStatus("loading");
    try {
      const article = await onLoadArticle(articleId);
      setSelectedArticle(article);
      setDetailStatus("idle");
    } catch {
      setDetailStatus("error");
    }
  }

  if (selectedArticle) {
    return (
      <article className="keenai-detail">
        <button
          type="button"
          className="keenai-text-button"
          onClick={() => setSelectedArticle(null)}
        >
          Back to articles
        </button>
        <small>{selectedArticle.collection}</small>
        <h2>{selectedArticle.title}</h2>
        <p>{selectedArticle.body}</p>
        <button type="button" className="keenai-secondary-button" onClick={onStartChat}>
          Ask AI Agent
        </button>
      </article>
    );
  }

  return (
    <div className="keenai-help">
      <label className="keenai-search">
        <span>Search</span>
        <input
          type="search"
          placeholder="Search articles"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {collections.length > 0 ? (
        <section className="keenai-chip-list" aria-label="Collections">
          {collections.map((collection) => (
            <span key={collection.slug} className="keenai-chip">
              {collection.name}
            </span>
          ))}
        </section>
      ) : null}
      <section className="keenai-card-list" aria-label="Help center">
        {filteredArticles.length > 0 ? (
          filteredArticles.map((article) => (
            <button
              key={article.id}
              type="button"
              className="keenai-content-card keenai-content-button"
              onClick={() => void openArticle(article.id)}
            >
              <small>{article.collection}</small>
              <strong>{article.title}</strong>
              {article.excerpt ? <p>{article.excerpt}</p> : null}
            </button>
          ))
        ) : (
          <article className="keenai-content-card">
            <strong>{articles.length > 0 ? "No matching articles" : "No articles yet"}</strong>
            <p>The team can still help directly.</p>
          </article>
        )}
      </section>
      {detailStatus === "loading" ? (
        <p className="keenai-inline-status">Loading article...</p>
      ) : null}
      {detailStatus === "error" ? (
        <p className="keenai-form-error">Could not load article.</p>
      ) : null}
      <button type="button" className="keenai-secondary-button" onClick={onStartChat}>
        Ask AI Agent
      </button>
    </div>
  );
}
