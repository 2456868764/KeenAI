import { useMemo, useState } from "preact/hooks";
import type { WidgetHelpArticle, WidgetHelpCollection } from "../types.js";

type HelpViewProps = {
  collections: WidgetHelpCollection[];
  articles: WidgetHelpArticle[];
  onStartChat: () => void;
};

export function HelpView({ collections, articles, onStartChat }: HelpViewProps) {
  const [query, setQuery] = useState("");
  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return articles;
    return articles.filter((article) =>
      `${article.title} ${article.excerpt ?? ""} ${article.collection}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [articles, query]);

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
            <article key={article.id} className="keenai-content-card">
              <small>{article.collection}</small>
              <strong>{article.title}</strong>
              {article.excerpt ? <p>{article.excerpt}</p> : null}
            </article>
          ))
        ) : (
          <article className="keenai-content-card">
            <strong>{articles.length > 0 ? "No matching articles" : "No articles yet"}</strong>
            <p>The team can still help directly.</p>
          </article>
        )}
      </section>
      <button type="button" className="keenai-secondary-button" onClick={onStartChat}>
        Ask AI Agent
      </button>
    </div>
  );
}
