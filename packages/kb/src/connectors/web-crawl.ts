import { createHash } from "node:crypto";
import type { KbConnector, KbFetchedDocument, KbResourceRef } from "./types.js";

type WebCrawlUrlConfig =
  | string
  | {
      url?: unknown;
      title?: unknown;
      canonicalLocale?: unknown;
      updatedAt?: unknown;
    };

export type WebCrawlConnectorConfig = {
  urls?: WebCrawlUrlConfig[];
  userAgent?: unknown;
};

type WebFetchResponse = {
  ok: boolean;
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type WebCrawlFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<WebFetchResponse>;

export type WebCrawlConnectorOptions = {
  fetchFn?: WebCrawlFetch;
  now?: () => Date;
};

type NormalizedUrl = {
  url: string;
  title?: string;
  canonicalLocale?: string;
  updatedAt: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeUrl(input: WebCrawlUrlConfig, now: Date): NormalizedUrl | null {
  const url = typeof input === "string" ? input : asString(input.url);
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const objectInput = typeof input === "string" ? {} : input;
  return {
    url: parsed.toString(),
    title: asString(objectInput.title),
    canonicalLocale: asString(objectInput.canonicalLocale),
    updatedAt: asString(objectInput.updatedAt) ?? now.toISOString(),
  };
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function extractHtmlTitle(html: string): string | undefined {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return asString(decodeEntities((title ?? h1 ?? "").replace(/<[^>]+>/g, " ")));
}

function htmlToMarkdownish(html: string, title: string): string {
  const text = decodeEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<(h[1-6]|p|li|br|div|section|article)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
  return [`# ${title}`, text].filter(Boolean).join("\n\n");
}

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const last = parsed.pathname.split("/").filter(Boolean).at(-1);
  return last ? decodeURIComponent(last).replace(/[-_]+/g, " ") : parsed.hostname;
}

/** Config-backed web connector for shallow HTTP page ingestion. */
export function createWebCrawlConnector(
  config: WebCrawlConnectorConfig = {},
  options: WebCrawlConnectorOptions = {},
): KbConnector {
  const now = options.now?.() ?? new Date();
  const pages = (config.urls ?? [])
    .map((url) => normalizeUrl(url, now))
    .filter((url): url is NormalizedUrl => !!url);
  const byExternalId = new Map(pages.map((page) => [page.url, page]));
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const userAgent = asString(config.userAgent) ?? "KeenAI-KB-Crawler/0.2";

  return {
    name: "web-crawl",
    type: "web",
    async list(opts) {
      const refs: KbResourceRef[] = pages.map((page) => ({
        externalId: page.url,
        updatedAt: page.updatedAt,
        etag: createHash("sha256").update(page.url).digest("hex").slice(0, 16),
      }));
      if (!opts.since) return refs;
      const since = opts.since;
      return refs.filter((ref) => new Date(ref.updatedAt) >= since);
    },
    async fetch(ref): Promise<KbFetchedDocument> {
      const page = byExternalId.get(ref.externalId);
      if (!page) throw new Error(`web_page_not_configured:${ref.externalId}`);

      const response = await fetchFn(page.url, { headers: { "user-agent": userAgent } });
      if (!response.ok) throw new Error(`web_fetch_failed:${response.status}`);

      const body = await response.text();
      const contentType = response.headers.get("content-type") ?? "text/html";
      const lastModified = response.headers.get("last-modified");
      const isHtml = contentType.includes("html") || /<html[\s>]/i.test(body);
      const title =
        page.title ?? (isHtml ? extractHtmlTitle(body) : undefined) ?? titleFromUrl(page.url);

      return {
        externalId: page.url,
        title,
        url: response.url || page.url,
        rawContent: isHtml ? htmlToMarkdownish(body, title) : body,
        contentType: isHtml ? "text/markdown" : contentType,
        canonicalLocale: page.canonicalLocale,
        updatedAt: lastModified ? new Date(lastModified).toISOString() : page.updatedAt,
      };
    },
    async healthCheck() {
      return pages.length > 0 && typeof fetchFn === "function";
    },
  };
}

export type WebCrawlConnector = ReturnType<typeof createWebCrawlConnector>;
