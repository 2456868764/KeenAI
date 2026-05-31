/**
 * Mastra `@mastra/core/agent` integration stub.
 * AE-02 will swap `buildKeeniAgentContext` internals to `new Agent({...})`.
 */
export const KEENI_AGENT_MASTRA_ADAPTER = {
  enabled: false,
  targetPackage: "@mastra/core/agent",
  notes: "Current runs use @keenai/llm streamText + maxSteps until Mastra ships.",
} as const;

export type MastraAgentStub = {
  id: string;
  name: string;
  instructions: string;
};

export function describeMastraAgentStub(input: {
  brandId: string;
  name: string;
  instructions: string;
}): MastraAgentStub {
  return {
    id: `keeni-${input.brandId}`,
    name: input.name,
    instructions: input.instructions,
  };
}
