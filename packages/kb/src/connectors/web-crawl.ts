import { createHash } from "node:crypto";
import type { KbSourceType } from "@keenai/storage/schema";
import { webCrawlConnectorConfigSchema } from "./schemas.js";
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
  crawlMode?: unknown;
  includePaths?: unknown;
  excludePaths?: unknown;
  maxPages?: unknown;
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
  type?: Extract<KbSourceType, "web" | "web_crawl">;
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function patternMatchesPath(pattern: string, path: string): boolean {
  const normalized = pattern.trim();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
  return new RegExp(`^${escaped}`).test(path);
}

function shouldIncludeUrl(
  url: string,
  rootOrigin: string,
  includePaths: string[],
  excludePaths: string[],
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== rootOrigin) return false;
  const path = parsed.pathname || "/";
  if (excludePaths.some((pattern) => patternMatchesPath(pattern, path))) return false;
  if (includePaths.length === 0) return true;
  return includePaths.some((pattern) => patternMatchesPath(pattern, path));
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    try {
      const parsed = new URL(href, baseUrl);
      parsed.hash = "";
      links.add(parsed.toString());
    } catch {
      // Ignore malformed hrefs.
    }
  }
  return [...links];
}

function extractSitemapLinks(xml: string): string[] {
  const links = new Set<string>();
  for (const match of xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const raw = decodeEntities((match[1] ?? "").trim());
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        parsed.hash = "";
        links.add(parsed.toString());
      }
    } catch {
      // Ignore malformed sitemap locations.
    }
  }
  return [...links];
}

function maxPages(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(Math.floor(value), 250))
    : 125;
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
  const crawlMode = asString(config.crawlMode) ?? "individual_links";
  const includePaths = asStringArray(config.includePaths);
  const excludePaths = asStringArray(config.excludePaths);
  const pageLimit = maxPages(config.maxPages);

  async function discoverPages(): Promise<NormalizedUrl[]> {
    if (crawlMode !== "crawl_links") return pages;

    const queue = [...pages];
    const discovered = new Map(pages.map((page) => [page.url, page]));
    for (let index = 0; index < queue.length && discovered.size < pageLimit; index += 1) {
      const page = queue[index];
      if (!page) continue;

      let response: WebFetchResponse;
      try {
        response = await fetchFn(page.url, { headers: { "user-agent": userAgent } });
      } catch {
        continue;
      }
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      const isSitemap =
        contentType.includes("xml") ||
        /<(urlset|sitemapindex)\b/i.test(body) ||
        page.url.endsWith(".xml");
      const isHtml = contentType.includes("html") || /<html[\s>]/i.test(body);
      if (!isSitemap && !isHtml) continue;

      const rootOrigin = new URL(page.url).origin;
      const links = isSitemap
        ? extractSitemapLinks(body)
        : extractLinks(body, response.url || page.url);
      for (const url of links) {
        if (discovered.size >= pageLimit) break;
        if (!shouldIncludeUrl(url, rootOrigin, includePaths, excludePaths)) continue;
        if (discovered.has(url)) continue;
        const next = {
          url,
          title: titleFromUrl(url),
          updatedAt: now.toISOString(),
        };
        discovered.set(url, next);
        byExternalId.set(url, next);
        queue.push(next);
      }
    }

    return [...discovered.values()];
  }

  return {
    name: "web-crawl",
    type: options.type ?? "web",
    configSchema() {
      return webCrawlConnectorConfigSchema;
    },
    async list(opts) {
      const availablePages = await discoverPages();
      const refs: KbResourceRef[] = availablePages.map((page) => ({
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
