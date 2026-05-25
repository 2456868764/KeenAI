import { createHash } from "node:crypto";
import type { KbConnector, KbFetchedDocument, KbResourceRef } from "./types.js";

const PAGES: Record<string, KbFetchedDocument> = {
  "web/docs/getting-started": {
    externalId: "web/docs/getting-started",
    title: "Getting Started",
    url: "https://docs.example.com/getting-started",
    rawContent: "# Getting Started\n\nInstall KeenAI with docker compose.",
    contentType: "text/markdown",
    canonicalLocale: "en",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
};

/** Deterministic web crawl connector stub (single page). */
export function createWebCrawlStubConnector(): KbConnector {
  return {
    name: "web-crawl-stub",
    type: "web",
    async list(opts) {
      const refs: KbResourceRef[] = Object.values(PAGES).map((page) => ({
        externalId: page.externalId,
        updatedAt: page.updatedAt,
        etag: createHash("sha256").update(page.rawContent).digest("hex").slice(0, 16),
      }));

      if (!opts.since) return refs;
      const since = opts.since;
      return refs.filter((ref) => new Date(ref.updatedAt) >= since);
    },
    async fetch(ref) {
      const page = PAGES[ref.externalId];
      if (!page) throw new Error(`web_page_not_found:${ref.externalId}`);
      return page;
    },
    async healthCheck() {
      return true;
    },
  };
}

export type WebCrawlStubConnector = ReturnType<typeof createWebCrawlStubConnector>;
