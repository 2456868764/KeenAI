const sections = [
  {
    title: "Getting started",
    description: "Install, migrate, seed, and run the API + Dashboard locally.",
    href: "https://github.com/keenai/keenai/blob/main/docs/ALPHA.md",
  },
  {
    title: "OpenAPI",
    description: "Machine-readable API spec at /api/v1/openapi.json when the API is running.",
    href: "http://localhost:8090/api/v1/openapi.json",
  },
  {
    title: "Roadmap",
    description: "Phase plan and iteration tracking for contributors.",
    href: "https://github.com/keenai/keenai/blob/main/docs/08-ROADMAP.md",
  },
  {
    title: "Widget embed",
    description: "Messenger widget bundle and boot script for customer sites.",
    href: "https://github.com/keenai/keenai/tree/main/apps/widget",
  },
];

export default function DocsHomePage() {
  return (
    <main>
      <h1>KeenAI Docs</h1>
      <p className="lead">
        Documentation site skeleton. Full Fumadocs MDX integration is planned — for now, use the
        links below and the repo docs folder.
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
        Run locally: <code>pnpm --filter @keenai/docs dev</code> (port 3001)
      </footer>
    </main>
  );
}
