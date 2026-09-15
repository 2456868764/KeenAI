type HelpViewProps = {
  onStartChat: () => void;
};

export function HelpView({ onStartChat }: HelpViewProps) {
  return (
    <div className="keenai-help">
      <label className="keenai-search">
        <span>Search</span>
        <input type="search" placeholder="Search articles" />
      </label>
      <section className="keenai-card-list" aria-label="Help center">
        <article className="keenai-content-card">
          <strong>Getting started</strong>
          <p>Browse setup guides and product basics.</p>
        </article>
        <article className="keenai-content-card">
          <strong>Troubleshooting</strong>
          <p>Find answers to common account and workspace questions.</p>
        </article>
      </section>
      <button type="button" className="keenai-secondary-button" onClick={onStartChat}>
        Ask AI Agent
      </button>
    </div>
  );
}
