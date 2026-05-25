import { createHash } from "node:crypto";
import type { KbConnector, KbFetchedDocument, KbResourceRef } from "./types.js";

const ARTICLES: Record<string, KbFetchedDocument> = {
  "help/export-csv": {
    externalId: "help/export-csv",
    title: "Export data as CSV",
    url: "https://help.example.com/export-csv",
    rawContent: "# Export CSV\n\nGo to Data Management and click Export.",
    contentType: "text/markdown",
    canonicalLocale: "en",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
  "help/billing-faq": {
    externalId: "help/billing-faq",
    title: "Billing FAQ",
    url: "https://help.example.com/billing-faq",
    rawContent: "# Billing FAQ\n\nPro plan invoices are emailed monthly.",
    contentType: "text/markdown",
    canonicalLocale: "en",
    updatedAt: "2026-04-10T00:00:00.000Z",
  },
};

/** Deterministic Help Center connector for local dev and tests. */
export function createHelpCenterStubConnector(): KbConnector {
  return {
    name: "help-center-stub",
    type: "help_center",
    async list(opts) {
      const refs = Object.values(ARTICLES).map((article) => ({
        externalId: article.externalId,
        updatedAt: article.updatedAt,
        etag: createHash("sha256").update(article.rawContent).digest("hex").slice(0, 16),
      }));

      if (!opts.since) return refs;

      const since = opts.since;
      return refs.filter((ref) => new Date(ref.updatedAt) >= since);
    },
    async fetch(ref) {
      const article = ARTICLES[ref.externalId];
      if (!article) throw new Error(`help_center_article_not_found:${ref.externalId}`);
      return article;
    },
    async healthCheck() {
      return true;
    },
  };
}

export type HelpCenterStubConnector = ReturnType<typeof createHelpCenterStubConnector>;
