import type { AgentMemoryConfig } from "./config.js";

let activeConfig: AgentMemoryConfig | null = null;

/** Install agentmemory sync config for the process (API bootstrap). */
export function initAgentMemoryRuntime(config: AgentMemoryConfig | null): void {
  activeConfig = config;
}

export function getAgentMemoryRuntime(): AgentMemoryConfig | null {
  return activeConfig;
}
