import type {
  HealthResponse,
  ProjectsResponse,
  RememberRequest,
  RememberResponse,
  SmartSearchRequest,
  SmartSearchResponse,
} from "./types.js";
import { DEFAULT_AGENTMEMORY_TIMEOUT_MS, DEFAULT_AGENTMEMORY_URL } from "./config.js";

export type AgentMemoryClientOptions = {
  url?: string;
  secret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function enforcePlaintextBearerGuard(url: string, secret: string | undefined): void {
  if (!secret) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol === "https:") return;

  const host = parsed.hostname;
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const requireHttps =
    process.env.AGENTMEMORY_REQUIRE_HTTPS === "1" ||
    process.env.AGENTMEMORY_REQUIRE_HTTPS?.toLowerCase() === "true";

  if (requireHttps) {
    throw new Error(
      `agentmemory_secret refuses plaintext scheme ${parsed.protocol} (AGENTMEMORY_REQUIRE_HTTPS=1)`,
    );
  }

  if (!loopback) {
    console.warn(
      `[memory-tree::agentmemory] bearer token configured for plaintext HTTP host ${host}`,
    );
  }
}

export class AgentMemoryClient {
  readonly baseUrl: string;
  private readonly secret?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AgentMemoryClientOptions = {}) {
    const baseUrl = (options.url ?? DEFAULT_AGENTMEMORY_URL).trim();
    if (!baseUrl) {
      throw new Error("agentmemory_url cannot be empty");
    }
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.secret = options.secret?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_AGENTMEMORY_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    enforcePlaintextBearerGuard(this.baseUrl, this.secret);
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, "")}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.secret) headers.Authorization = `Bearer ${this.secret}`;
    return headers;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url(path), {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`agentmemory ${method} ${path} failed (${res.status}): ${text.slice(0, 512)}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async livez(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(this.url("agentmemory/livez"), {
          method: "GET",
          headers: this.headers(),
          signal: controller.signal,
        });
        return res.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "agentmemory/health");
  }

  async remember(body: RememberRequest): Promise<RememberResponse> {
    return this.request<RememberResponse>("POST", "agentmemory/remember", body);
  }

  async smartSearch(body: SmartSearchRequest): Promise<SmartSearchResponse> {
    return this.request<SmartSearchResponse>("POST", "agentmemory/smart-search", body);
  }

  async projects(): Promise<ProjectsResponse> {
    return this.request<ProjectsResponse>("GET", "agentmemory/projects");
  }
}
