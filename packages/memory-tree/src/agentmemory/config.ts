export const DEFAULT_AGENTMEMORY_URL = "http://localhost:3111";
export const DEFAULT_AGENTMEMORY_TIMEOUT_MS = 5_000;

export type AgentMemoryConfig = {
  /** When true, sealed summaries and daily digests sync to agentmemory. */
  syncEnabled: boolean;
  url: string;
  secret?: string;
  timeoutMs: number;
};

export type AgentMemoryEnv = {
  MEMORY_TREE_AGENTMEMORY_SYNC?: string | boolean;
  AGENTMEMORY_URL?: string;
  AGENTMEMORY_SECRET?: string;
  AGENTMEMORY_TIMEOUT_MS?: string | number;
  AGENTMEMORY_REQUIRE_HTTPS?: string;
};

function truthy(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

/** Resolve agentmemory sync settings from process env (OpenHuman-compatible defaults). */
export function resolveAgentMemoryConfig(
  env: AgentMemoryEnv = (typeof process !== "undefined"
    ? process.env
    : {}) as AgentMemoryEnv,
): AgentMemoryConfig {
  const url = (env.AGENTMEMORY_URL ?? DEFAULT_AGENTMEMORY_URL).trim();
  const secret = env.AGENTMEMORY_SECRET?.trim() || undefined;
  const timeoutMs = Number(env.AGENTMEMORY_TIMEOUT_MS ?? DEFAULT_AGENTMEMORY_TIMEOUT_MS);

  return {
    syncEnabled: truthy(env.MEMORY_TREE_AGENTMEMORY_SYNC ?? false),
    url: url.length > 0 ? url : DEFAULT_AGENTMEMORY_URL,
    secret,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_AGENTMEMORY_TIMEOUT_MS,
  };
}

export function agentMemoryProject(orgId: string, brandId: string): string {
  return `keenai:${orgId}:${brandId}`;
}
