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

type AnydocModule = {
  toMarkdownBytes?: (
    bytes: Uint8Array,
    format?: string,
    options?: Record<string, unknown>,
  ) => Promise<string>;
};

export type KbAnydocParserOptions = {
  loadModule?: () => Promise<AnydocModule>;
  ocr?: "hosted" | false;
  apiKey?: string;
};

export type KbDocumentParserHttpOptions = {
  id?: string;
  endpoint: string;
  engine?: KbDocumentParserEngine;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
};

export type KbDocumentParserEngine = "docling";

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
  KEENAI_KB_DOCUMENT_PARSER?: "anydoc" | "http" | "cloud" | string;
  KEENAI_KB_DOCUMENT_PARSER_URL?: string;
  KEENAI_KB_DOCUMENT_PARSER_ENGINE?: KbDocumentParserEngine | string;
  KEENAI_KB_CLOUD_DOCUMENT_PARSER_PROVIDER?: KbDocumentParserCloudProvider;
  KEENAI_KB_CLOUD_DOCUMENT_PARSER_URL?: string;
  KEENAI_KB_CLOUD_DOCUMENT_PARSER_API_KEY?: string;
  FIRECRAWL_API_KEY?: string;
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

function contentTypeIncludes(contentType: string | null | undefined, token: string): boolean {
  return contentType?.toLowerCase().includes(token) ?? false;
}

function extensionFromFileName(fileName: string | null | undefined): string | undefined {
  const name = fileName?.toLowerCase().split(/[?#]/, 1)[0];
  const ext = name?.match(/\.([a-z0-9]+)$/)?.[1];
  return ext || undefined;
}

function anydocFormatForInput(input: ParseKbDocumentInput): string | undefined {
  const fromName = extensionFromFileName(input.fileName ?? input.url);
  if (fromName) return fromName;
  if (contentTypeIncludes(input.contentType, "pdf")) return "pdf";
  if (contentTypeIncludes(input.contentType, "wordprocessingml")) return "docx";
  if (contentTypeIncludes(input.contentType, "msword")) return "doc";
  if (contentTypeIncludes(input.contentType, "presentationml")) return "pptx";
  if (contentTypeIncludes(input.contentType, "powerpoint")) return "ppt";
  if (contentTypeIncludes(input.contentType, "spreadsheetml")) return "xlsx";
  if (contentTypeIncludes(input.contentType, "excel")) return "xls";
  if (contentTypeIncludes(input.contentType, "rtf")) return "rtf";
  if (contentTypeIncludes(input.contentType, "epub")) return "epub";
  if (contentTypeIncludes(input.contentType, "csv")) return "csv";
  return undefined;
}

function shouldUseAnydoc(input: ParseKbDocumentInput): boolean {
  const format = anydocFormatForInput(input);
  return !!format && !["md", "markdown", "html", "htm", "txt", "text"].includes(format);
}

function decodeRawContentBytes(
  input: ParseKbDocumentInput,
  format: string | undefined,
): Uint8Array {
  const raw = input.rawContent;
  const dataUrl = /^data:[^;]+;base64,(.+)$/s.exec(raw.trim());
  if (dataUrl?.[1]) return Buffer.from(dataUrl[1].replace(/\s+/g, ""), "base64");

  if (
    contentTypeIncludes(input.contentType, "text/") ||
    format === "csv" ||
    format === "txt" ||
    format === "md" ||
    format === "markdown"
  ) {
    return Buffer.from(raw, "utf8");
  }

  const compact = raw.replace(/\s+/g, "");
  if (compact.length > 0 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    const decoded = Buffer.from(compact, "base64");
    const magic4 = decoded.subarray(0, 4).toString("latin1");
    if (
      magic4 === "%PDF" ||
      magic4.startsWith("PK") ||
      decoded.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    ) {
      return decoded;
    }
  }

  return Buffer.from(raw, "utf8");
}

async function loadDefaultAnydocModule(): Promise<AnydocModule> {
  return (await import("@firecrawl/anydoc")) as AnydocModule;
}

export function createAnydocKbDocumentParserProvider(
  options: KbAnydocParserOptions = {},
): KbDocumentParserProvider {
  return {
    id: "anydoc",
    supports() {
      return true;
    },
    async parse(input) {
      if (shouldUseAnydoc(input)) {
        const anydoc = await (options.loadModule ?? loadDefaultAnydocModule)();
        if (typeof anydoc.toMarkdownBytes !== "function") {
          throw new Error("kb_anydoc_to_markdown_bytes_unavailable");
        }
        const format = anydocFormatForInput(input);
        const markdown = await anydoc.toMarkdownBytes(
          decodeRawContentBytes(input, format),
          format,
          {
            ...(options.ocr ? { ocr: options.ocr } : {}),
            ...(options.apiKey ? { apiKey: options.apiKey } : {}),
          },
        );
        return {
          title: input.title,
          markdown,
          provider: "anydoc",
          metadata: { engine: "anydoc", format },
        };
      }

      return {
        ...parseKbDocument(input),
        parserProvider: "anydoc",
        metadata: { engine: "anydoc", parserProvider: "anydoc", adapter: "native-text" },
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

function isParserEngine(value: string | undefined): value is KbDocumentParserEngine {
  return value === "docling";
}

export function resolveKbDocumentParserProviderFromEnv(
  env: ResolveKbDocumentParserProviderEnv = process.env as ResolveKbDocumentParserProviderEnv,
): KbDocumentParserProvider {
  const mode = env.KEENAI_KB_DOCUMENT_PARSER ?? "anydoc";
  if (mode === "anydoc") {
    return createAnydocKbDocumentParserProvider({
      apiKey: env.FIRECRAWL_API_KEY,
      ocr: env.FIRECRAWL_API_KEY ? "hosted" : false,
    });
  }

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
  provider: KbDocumentParserProvider = createAnydocKbDocumentParserProvider(),
): Promise<ParsedKbDocument> {
  if (!provider.supports(input)) {
    throw new Error(`kb_document_parser_unsupported:${provider.id}`);
  }
  return normalizeParserResult(input, await provider.parse(input), provider.id);
}
