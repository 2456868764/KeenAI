import {
  type ParseKbDocumentInput,
  type ParsedKbDocument,
  parseKbDocument,
} from "./parse-document.js";

export type KbParsedDocumentBlock = {
  type: "heading" | "paragraph" | "table" | "list" | "code" | "figure" | "text";
  text: string;
  pageNumber?: number;
  headingPath?: string[];
  metadata?: Record<string, unknown>;
};

export type KbDocumentParserResult = {
  title?: string;
  markdown: string;
  blocks?: KbParsedDocumentBlock[];
  attachments?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  provider?: string;
};

export type KbDocumentParserProvider = {
  id: string;
  supports(input: ParseKbDocumentInput): boolean;
  parse(input: ParseKbDocumentInput): Promise<KbDocumentParserResult | ParsedKbDocument>;
};

export type KbDocumentParserHttpOptions = {
  id?: string;
  endpoint: string;
  engine?: "docling";
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
};

export type KbDocumentParserCloudProvider =
  | "azure-document-intelligence"
  | "google-document-ai"
  | "aws-textract"
  | "llamaparse"
  | "unstructured"
  | "mistral-ocr"
  | "landingai-ade"
  | string;

export type KbDocumentParserCloudOptions = Omit<KbDocumentParserHttpOptions, "id" | "engine"> & {
  provider: KbDocumentParserCloudProvider;
};

export type ResolveKbDocumentParserProviderEnv = {
  KEENAI_KB_DOCUMENT_PARSER?: "lite" | "http" | "cloud" | string;
  KEENAI_KB_DOCUMENT_PARSER_URL?: string;
  KEENAI_KB_DOCUMENT_PARSER_ENGINE?: "docling" | string;
  KEENAI_KB_CLOUD_DOCUMENT_PARSER_PROVIDER?: KbDocumentParserCloudProvider;
  KEENAI_KB_CLOUD_DOCUMENT_PARSER_URL?: string;
  KEENAI_KB_CLOUD_DOCUMENT_PARSER_API_KEY?: string;
};

function isParsedDocument(
  value: KbDocumentParserResult | ParsedKbDocument,
): value is ParsedKbDocument {
  return Array.isArray((value as ParsedKbDocument).sections);
}

function mergeParserMetadata(
  parsed: ParsedKbDocument,
  result: KbDocumentParserResult,
  providerId: string,
): ParsedKbDocument {
  return {
    ...parsed,
    parserProvider: result.provider ?? providerId,
    metadata: {
      ...(parsed.metadata ?? {}),
      ...(result.metadata ?? {}),
      ...(result.attachments ? { attachments: result.attachments } : {}),
      parserProvider: result.provider ?? providerId,
    },
  };
}

export function createLiteKbDocumentParserProvider(): KbDocumentParserProvider {
  return {
    id: "lite",
    supports() {
      return true;
    },
    async parse(input) {
      return {
        ...parseKbDocument(input),
        parserProvider: "lite",
        metadata: { parserProvider: "lite" },
      };
    },
  };
}

function normalizeParserResult(
  input: ParseKbDocumentInput,
  result: KbDocumentParserResult | ParsedKbDocument,
  providerId: string,
): ParsedKbDocument {
  if (isParsedDocument(result)) {
    return {
      ...result,
      parserProvider: result.parserProvider ?? providerId,
      metadata: { ...(result.metadata ?? {}), parserProvider: result.parserProvider ?? providerId },
    };
  }

  const parsed = parseKbDocument({
    title: result.title ?? input.title,
    rawContent: result.markdown,
    contentType: "text/markdown",
  });
  return mergeParserMetadata(parsed, result, providerId);
}

async function postJson(
  options: KbDocumentParserHttpOptions,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (!fetchFn) throw new Error("kb_document_parser_fetch_unavailable");

  const response = await fetchFn(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`kb_document_parser_http_failed:${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : undefined;
}

function normalizeHttpResponse(body: Record<string, unknown>): KbDocumentParserResult {
  const markdown = readString(body.markdown) ?? readString(body.content) ?? readString(body.text);
  if (!markdown) throw new Error("kb_document_parser_empty_markdown");

  return {
    title: readString(body.title),
    markdown,
    blocks: readRecordArray(body.blocks) as KbParsedDocumentBlock[] | undefined,
    attachments: readRecordArray(body.attachments),
    metadata: readObject(body.metadata),
    provider: readString(body.provider),
  };
}

export function createHttpKbDocumentParserProvider(
  options: KbDocumentParserHttpOptions,
): KbDocumentParserProvider {
  return {
    id: options.id ?? `http:${options.engine ?? "document-parser"}`,
    supports() {
      return true;
    },
    async parse(input) {
      const body = await postJson(options, {
        title: input.title,
        raw_content: input.rawContent,
        content_type: input.contentType,
        url: input.url,
        file_name: input.fileName,
        engine: options.engine,
      });
      return normalizeHttpResponse(body);
    },
  };
}

export function createCloudKbDocumentParserProvider(
  options: KbDocumentParserCloudOptions,
): KbDocumentParserProvider {
  return createHttpKbDocumentParserProvider({
    ...options,
    id: `cloud:${options.provider}`,
    headers: {
      "x-kb-cloud-parser-provider": options.provider,
      ...(options.headers ?? {}),
    },
  });
}

function isParserEngine(value: string | undefined): value is "docling" {
  return value === "docling";
}

export function resolveKbDocumentParserProviderFromEnv(
  env: ResolveKbDocumentParserProviderEnv = process.env as ResolveKbDocumentParserProviderEnv,
): KbDocumentParserProvider {
  const mode = env.KEENAI_KB_DOCUMENT_PARSER ?? "lite";
  if (mode === "lite") return createLiteKbDocumentParserProvider();

  if (mode === "http") {
    if (!env.KEENAI_KB_DOCUMENT_PARSER_URL) {
      throw new Error("kb_document_parser_url_required");
    }
    return createHttpKbDocumentParserProvider({
      endpoint: env.KEENAI_KB_DOCUMENT_PARSER_URL,
      engine: isParserEngine(env.KEENAI_KB_DOCUMENT_PARSER_ENGINE)
        ? env.KEENAI_KB_DOCUMENT_PARSER_ENGINE
        : "docling",
    });
  }

  if (mode === "cloud") {
    const endpoint = env.KEENAI_KB_CLOUD_DOCUMENT_PARSER_URL ?? env.KEENAI_KB_DOCUMENT_PARSER_URL;
    const provider = env.KEENAI_KB_CLOUD_DOCUMENT_PARSER_PROVIDER;
    if (!endpoint || !provider) {
      throw new Error("kb_cloud_document_parser_config_required");
    }
    return createCloudKbDocumentParserProvider({
      endpoint,
      provider,
      headers: env.KEENAI_KB_CLOUD_DOCUMENT_PARSER_API_KEY
        ? { authorization: `Bearer ${env.KEENAI_KB_CLOUD_DOCUMENT_PARSER_API_KEY}` }
        : undefined,
    });
  }

  throw new Error(`kb_document_parser_mode_unsupported:${mode}`);
}

export async function parseKbDocumentWithProvider(
  input: ParseKbDocumentInput,
  provider: KbDocumentParserProvider = createLiteKbDocumentParserProvider(),
): Promise<ParsedKbDocument> {
  if (!provider.supports(input)) {
    throw new Error(`kb_document_parser_unsupported:${provider.id}`);
  }
  return normalizeParserResult(input, await provider.parse(input), provider.id);
}
