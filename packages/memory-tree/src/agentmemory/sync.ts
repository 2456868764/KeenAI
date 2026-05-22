import type { MemorySummaryProvenance } from "@keenai/storage/schema";
import type { AgentMemoryConfig } from "./config.js";
import { agentMemoryProject } from "./config.js";
import { AgentMemoryClient } from "./client.js";
import { mapSummaryToRemember } from "./mapping.js";
import type { AgentMemoryRecallHit } from "./types.js";

export type AgentMemorySyncInput = {
  orgId: string;
  brandId: string;
  scopeKey: string;
  title: string | null;
  summary: string;
  provenance: MemorySummaryProvenance;
  kind: "seal" | "digest";
};

export type AgentMemorySyncResult = {
  synced: boolean;
  memoryId?: string;
  reason?: string;
};

export function createAgentMemoryClient(config: AgentMemoryConfig): AgentMemoryClient {
  return new AgentMemoryClient({
    url: config.url,
    secret: config.secret,
    timeoutMs: config.timeoutMs,
  });
}

/** Push a sealed summary or digest node to agentmemory when sync is enabled. */
export async function syncSummaryToAgentMemory(
  config: AgentMemoryConfig,
  input: AgentMemorySyncInput,
): Promise<AgentMemorySyncResult> {
  if (!config.syncEnabled) {
    return { synced: false, reason: "sync_disabled" };
  }

  const client = createAgentMemoryClient(config);
  const body = mapSummaryToRemember(input);
  const res = await client.remember(body);
  return { synced: true, memoryId: res.id };
}

/** Hybrid recall via agentmemory smart-search (BM25 + vector + graph). */
export async function recallFromAgentMemory(
  config: AgentMemoryConfig,
  input: { orgId: string; brandId: string; q: string; limit?: number },
): Promise<AgentMemoryRecallHit[]> {
  const client = createAgentMemoryClient(config);
  const res = await client.smartSearch({
    query: input.q,
    limit: input.limit ?? 20,
    project: agentMemoryProject(input.orgId, input.brandId),
  });

  return res.results.map((row) => ({
    id: row.id,
    title: row.title ?? row.id,
    content: row.content ?? "",
    project: row.project ?? null,
    score: row.score ?? null,
  }));
}

export async function probeAgentMemory(config: AgentMemoryConfig): Promise<{
  reachable: boolean;
  url: string;
  syncEnabled: boolean;
  memories?: number;
}> {
  const client = createAgentMemoryClient(config);
  const reachable = await client.livez();
  if (!reachable) {
    return { reachable: false, url: config.url, syncEnabled: config.syncEnabled };
  }
  try {
    const health = await client.health();
    return {
      reachable: true,
      url: config.url,
      syncEnabled: config.syncEnabled,
      memories: health.memories,
    };
  } catch {
    return { reachable: true, url: config.url, syncEnabled: config.syncEnabled };
  }
}
