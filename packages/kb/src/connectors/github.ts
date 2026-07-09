import { createHash } from "node:crypto";
import type { KbConnector, KbFetchedDocument, KbResourceRef } from "./types.js";

type GitHubFileConfig =
  | string
  | {
      url?: unknown;
      path?: unknown;
      title?: unknown;
      updatedAt?: unknown;
    };

export type GitHubConnectorConfig = {
  files?: GitHubFileConfig[];
  token?: unknown;
  userAgent?: unknown;
};

type GitHubFetchResponse = {
  ok: boolean;
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type GitHubFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<GitHubFetchResponse>;

export type GitHubConnectorOptions = {
  fetchFn?: GitHubFetch;
  now?: () => Date;
};

type NormalizedFile = {
  url: string;
  path: string;
  title?: string;
  updatedAt: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeFile(input: GitHubFileConfig, now: Date): NormalizedFile | null {
  const url = typeof input === "string" ? input : asString(input.url);
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const objectInput = typeof input === "string" ? {} : input;
  const path =
    asString(objectInput.path) ?? decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return {
    url: parsed.toString(),
    path,
    title: asString(objectInput.title),
    updatedAt: asString(objectInput.updatedAt) ?? now.toISOString(),
  };
}

function titleFromPath(path: string): string {
  const last = path.split("/").filter(Boolean).at(-1) ?? "GitHub document";
  return last.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

/** Config-backed GitHub connector for README/wiki/issue-export raw content. */
export function createGitHubConnector(
  config: GitHubConnectorConfig = {},
  options: GitHubConnectorOptions = {},
): KbConnector {
  const now = options.now?.() ?? new Date();
  const files = (config.files ?? [])
    .map((file) => normalizeFile(file, now))
    .filter((file): file is NormalizedFile => !!file);
  const byExternalId = new Map(files.map((file) => [file.url, file]));
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const token = asString(config.token);
  const userAgent = asString(config.userAgent) ?? "KeenAI-KB-GitHub/0.2";

  return {
    name: "github",
    type: "github",
    async list(opts) {
      const refs: KbResourceRef[] = files.map((file) => ({
        externalId: file.url,
        updatedAt: file.updatedAt,
        etag: createHash("sha256").update(file.url).digest("hex").slice(0, 16),
      }));
      if (!opts.since) return refs;
      const since = opts.since;
      return refs.filter((ref) => new Date(ref.updatedAt) >= since);
    },
    async fetch(ref): Promise<KbFetchedDocument> {
      const file = byExternalId.get(ref.externalId);
      if (!file) throw new Error(`github_file_not_configured:${ref.externalId}`);

      const headers: Record<string, string> = {
        accept: "text/plain, text/markdown, application/vnd.github.raw",
        "user-agent": userAgent,
      };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetchFn(file.url, { headers });
      if (!response.ok) throw new Error(`github_fetch_failed:${response.status}`);

      const contentType = response.headers.get("content-type") ?? "text/markdown";
      const lastModified = response.headers.get("last-modified");
      return {
        externalId: file.url,
        title: file.title ?? titleFromPath(file.path),
        url: response.url || file.url,
        rawContent: await response.text(),
        contentType,
        updatedAt: lastModified ? new Date(lastModified).toISOString() : file.updatedAt,
      };
    },
    async healthCheck() {
      return files.length > 0 && typeof fetchFn === "function";
    },
  };
}

export type GitHubConnector = ReturnType<typeof createGitHubConnector>;
