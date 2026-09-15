export type KbUrlParserInput = {
  url: string;
  title?: string;
};

export type KbUrlParserResult = {
  title?: string;
  markdown: string;
  metadata?: Record<string, unknown>;
  provider?: string;
};

export type KbUrlParserProvider = {
  id: string;
  parse(input: KbUrlParserInput): Promise<KbUrlParserResult>;
};

export type KbUrlParserHttpOptions = {
  endpoint: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
};

export type ResolveKbUrlParserProviderEnv = {
  KEENAI_KB_URL_PARSER?: "firecrawl" | "crawl4ai" | string;
  KEENAI_KB_URL_PARSER_URL?: string;
  FIRECRAWL_API_KEY?: string;
  FIRECRAWL_API_URL?: string;
  CRAWL4AI_API_URL?: string;
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return readObject(value[0]);
  return readObject(value);
}

function extractMarkdown(body: Record<string, unknown>): {
  markdown?: string;
  title?: string;
  metadata?: Record<string, unknown>;
} {
  const data =
    readObject(body.data) ?? readObject(body.result) ?? firstRecord(body.results) ?? body;
  const nestedMetadata = readObject(data.metadata) ?? readObject(body.metadata);
  return {
    markdown:
      readString(data.markdown) ??
      readString(data.content) ??
      readString(data.cleaned_html) ??
      readString(data.html) ??
      readString(body.markdown),
    title:
      readString(data.title) ??
      readString(nestedMetadata?.title) ??
      readString(body.title) ??
      readString(body.url),
    metadata: nestedMetadata ?? readObject(data),
  };
}

async function postJson(
  options: KbUrlParserHttpOptions,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (!fetchFn) throw new Error("kb_url_parser_fetch_unavailable");

  const response = await fetchFn(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`kb_url_parser_http_failed:${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function normalizeUrlParserResult(
  provider: string,
  input: KbUrlParserInput,
  body: Record<string, unknown>,
): KbUrlParserResult {
  const extracted = extractMarkdown(body);
  if (!extracted.markdown) throw new Error("kb_url_parser_empty_markdown");
  return {
    title: extracted.title ?? input.title,
    markdown: extracted.markdown,
    provider,
    metadata: {
      ...(extracted.metadata ?? {}),
      provider,
      sourceUrl: input.url,
    },
  };
}

export function createFirecrawlUrlParserProvider(
  options: KbUrlParserHttpOptions,
): KbUrlParserProvider {
  return {
    id: "firecrawl",
    async parse(input) {
      const body = await postJson(options, {
        url: input.url,
        formats: ["markdown"],
      });
      return normalizeUrlParserResult("firecrawl", input, body);
    },
  };
}

export function createCrawl4AiUrlParserProvider(
  options: KbUrlParserHttpOptions,
): KbUrlParserProvider {
  return {
    id: "crawl4ai",
    async parse(input) {
      const body = await postJson(options, {
        urls: [input.url],
        url: input.url,
        browser_config: {},
        crawler_config: {},
      });
      return normalizeUrlParserResult("crawl4ai", input, body);
    },
  };
}

export function resolveKbUrlParserProviderFromEnv(
  env: ResolveKbUrlParserProviderEnv = process.env as ResolveKbUrlParserProviderEnv,
): KbUrlParserProvider | null {
  const mode = env.KEENAI_KB_URL_PARSER;
  if (!mode) return null;

  if (mode === "firecrawl") {
    return createFirecrawlUrlParserProvider({
      endpoint:
        env.KEENAI_KB_URL_PARSER_URL ??
        env.FIRECRAWL_API_URL ??
        "https://api.firecrawl.dev/v2/scrape",
      apiKey: env.FIRECRAWL_API_KEY,
    });
  }

  if (mode === "crawl4ai") {
    return createCrawl4AiUrlParserProvider({
      endpoint:
        env.KEENAI_KB_URL_PARSER_URL ?? env.CRAWL4AI_API_URL ?? "http://127.0.0.1:11235/crawl",
    });
  }

  throw new Error(`kb_url_parser_mode_unsupported:${mode}`);
}
