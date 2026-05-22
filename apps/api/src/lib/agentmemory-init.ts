import { initAgentMemoryRuntime, resolveAgentMemoryConfig } from "@keenai/memory-tree";
import type { ApiEnv } from "@keenai/shared";

/** Bootstrap optional agentmemory sync runtime from API env. */
export function initAgentMemoryFromEnv(env: ApiEnv): void {
  initAgentMemoryRuntime(
    resolveAgentMemoryConfig({
      MEMORY_TREE_AGENTMEMORY_SYNC: env.MEMORY_TREE_AGENTMEMORY_SYNC,
      AGENTMEMORY_URL: env.AGENTMEMORY_URL,
      AGENTMEMORY_SECRET: env.AGENTMEMORY_SECRET,
      AGENTMEMORY_TIMEOUT_MS: env.AGENTMEMORY_TIMEOUT_MS,
    }),
  );
}

export function getAgentMemoryConfigFromEnv(env: ApiEnv) {
  return resolveAgentMemoryConfig({
    MEMORY_TREE_AGENTMEMORY_SYNC: env.MEMORY_TREE_AGENTMEMORY_SYNC,
    AGENTMEMORY_URL: env.AGENTMEMORY_URL,
    AGENTMEMORY_SECRET: env.AGENTMEMORY_SECRET,
    AGENTMEMORY_TIMEOUT_MS: env.AGENTMEMORY_TIMEOUT_MS,
  });
}
