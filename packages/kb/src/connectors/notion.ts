import { createHash } from "node:crypto";
import { notionConnectorConfigSchema } from "./schemas.js";
import type { KbConnector, KbFetchedDocument, KbResourceRef } from "./types.js";

type NotionPageConfig =
  | string
  | {
      pageId?: unknown;
      title?: unknown;
      updatedAt?: unknown;
    };

export type NotionConnectorConfig = {
  pageIds?: NotionPageConfig[];
  token?: unknown;
  version?: unknown;
};

type NotionFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type NotionFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<NotionFetchResponse>;

export type NotionConnectorOptions = {
  fetchFn?: NotionFetch;
  now?: () => Date;
};

type NormalizedPage = {
  pageId: string;
  title?: string;
  updatedAt: string;
};

type RichText = {
  plain_text?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePage(input: NotionPageConfig, now: Date): NormalizedPage | null {
  const pageId = typeof input === "string" ? input : asString(input.pageId);
  if (!pageId) return null;
  const objectInput = typeof input === "string" ? {} : input;
  return {
    pageId,
    title: asString(objectInput.title),
    updatedAt: asString(objectInput.updatedAt) ?? now.toISOString(),
  };
}

function richTextToPlain(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((part: RichText) => asString(part.plain_text))
    .filter((part): part is string => !!part)
    .join("");
}

function titleFromPageJson(page: unknown, fallback: string): string {
  const properties =
    typeof page === "object" && page !== null && "properties" in page
      ? (page.properties as Record<string, unknown>)
      : {};
  for (const value of Object.values(properties)) {
    if (typeof value !== "object" || value === null) continue;
    const property = value as { type?: unknown; title?: unknown };
    if (property.type === "title") {
      const title = richTextToPlain(property.title);
      if (title) return title;
    }
  }
  return fallback;
}

function blockToMarkdown(block: unknown): string | null {
  if (typeof block !== "object" || block === null || !("type" in block)) return null;
  const typed = block as Record<string, unknown> & { type: string };
  const body = typed[typed.type] as Record<string, unknown> | undefined;
  if (!body) return null;

  const text = richTextToPlain(body.rich_text);
  if (!text) return null;
  if (typed.type === "heading_1") return `# ${text}`;
  if (typed.type === "heading_2") return `## ${text}`;
  if (typed.type === "heading_3") return `### ${text}`;
  if (typed.type === "bulleted_list_item") return `- ${text}`;
  if (typed.type === "numbered_list_item") return `1. ${text}`;
  return text;
}

/** Config-backed Notion connector for page + child block ingestion. */
export function createNotionConnector(
  config: NotionConnectorConfig = {},
  options: NotionConnectorOptions = {},
): KbConnector {
  const now = options.now?.() ?? new Date();
  const pages = (config.pageIds ?? [])
    .map((page) => normalizePage(page, now))
    .filter((page): page is NormalizedPage => !!page);
  const byExternalId = new Map(pages.map((page) => [page.pageId, page]));
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const token = asString(config.token);
  const version = asString(config.version) ?? "2022-06-28";

  return {
    name: "notion",
    type: "notion",
    configSchema() {
      return notionConnectorConfigSchema;
    },
    async list(opts) {
      const refs: KbResourceRef[] = pages.map((page) => ({
        externalId: page.pageId,
        updatedAt: page.updatedAt,
        etag: createHash("sha256").update(page.pageId).digest("hex").slice(0, 16),
      }));
      if (!opts.since) return refs;
      const since = opts.since;
      return refs.filter((ref) => new Date(ref.updatedAt) >= since);
    },
    async fetch(ref): Promise<KbFetchedDocument> {
      const page = byExternalId.get(ref.externalId);
      if (!page) throw new Error(`notion_page_not_configured:${ref.externalId}`);
      if (!token) throw new Error("notion_token_missing");

      const headers = {
        authorization: `Bearer ${token}`,
        "notion-version": version,
      };
      const pageResponse = await fetchFn(`https://api.notion.com/v1/pages/${page.pageId}`, {
        headers,
      });
      if (!pageResponse.ok) throw new Error(`notion_page_fetch_failed:${pageResponse.status}`);
      const pageJson = await pageResponse.json();
      const title = page.title ?? titleFromPageJson(pageJson, `Notion page ${page.pageId}`);

      const blockResponse = await fetchFn(
        `https://api.notion.com/v1/blocks/${page.pageId}/children?page_size=100`,
        { headers },
      );
      if (!blockResponse.ok) throw new Error(`notion_blocks_fetch_failed:${blockResponse.status}`);
      const blockJson = await blockResponse.json();
      const results =
        typeof blockJson === "object" && blockJson !== null && "results" in blockJson
          ? blockJson.results
          : [];
      const body = Array.isArray(results)
        ? results
            .map(blockToMarkdown)
            .filter((line): line is string => !!line)
            .join("\n\n")
        : "";

      return {
        externalId: page.pageId,
        title,
        url: `https://www.notion.so/${page.pageId.replaceAll("-", "")}`,
        rawContent: [`# ${title}`, body].filter(Boolean).join("\n\n"),
        contentType: "text/markdown",
        updatedAt: page.updatedAt,
      };
    },
    async healthCheck() {
      return pages.length > 0 && typeof fetchFn === "function" && !!token;
    },
  };
}

export type NotionConnector = ReturnType<typeof createNotionConnector>;
