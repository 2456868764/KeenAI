const repo = "https://github.com/2456868764/KeenAI/blob/main";

const sections = [
  {
    title: "Documentation hub",
    description: "Curated index of all design docs in docs/.",
    href: `${repo}/docs/index.md`,
  },
  {
    title: "Alpha quick start",
    description: "Install, migrate, seed, Docker lite, demo login.",
    href: `${repo}/docs/ALPHA.md`,
  },
  {
    title: "Deployment",
    description: "Docker profiles, Bun binary, kb:eval / kb:bench.",
    href: `${repo}/docs/DEPLOYMENT.md`,
  },
  {
    title: "Migration (import)",
    description: "Intercom / Zendesk import via keenai import stub.",
    href: `${repo}/docs/MIGRATION.md`,
  },
  {
    title: "GA checklist",
    description: "1.0 release engineering and quality gates.",
    href: `${repo}/docs/GA.md`,
  },
  {
    title: "Roadmap",
    description: "Phase plan and Sprint 18 status.",
    href: `${repo}/docs/08-ROADMAP.md`,
  },
  {
    title: "RAG optimization",
    description: "KB-07～24 execution track.",
    href: `${repo}/docs/11-RAG-OPTIMIZATION.md`,
  },
  {
    title: "OpenAPI",
    description: "Live spec when API is running locally.",
    href: "http://localhost:8090/api/v1/openapi.json",
  },
];

export default function DocsHomePage() {
  return (
    <main>
      <h1>KeenAI Docs</h1>
      <p className="lead">
        Documentation site (Sprint 18 · I103). Browse repo markdown via the hub below; MDX
        integration is planned for GA.
      </p>

      <nav aria-label="Documentation sections">
        <ul>
          {sections.map((section) => (
            <li key={section.title}>
              <a href={section.href} target="_blank" rel="noreferrer">
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <footer>
        <p>
          Local dev: <code>pnpm --filter @keenai/docs dev</code> (port 3001)
        </p>
        <p>
          CLI: <code>pnpm keenai import …</code> · Eval: <code>pnpm kb:eval</code>
        </p>
      </footer>
    </main>
  );
}
