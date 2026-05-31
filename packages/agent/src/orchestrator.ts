import type { DraftRequest } from "@keenai/llm";
import { type KeeniPersonality, buildAgentSystemPrompt, buildPersonality } from "./personality.js";
import type { KeeniAgentParams } from "./types.js";

/** Runtime context assembled before an agent run (Mastra Agent adapter target). */
export type KeeniAgentContext = {
  params: KeeniAgentParams;
  personality: KeeniPersonality;
  draftRequest: DraftRequest;
  maxIterations: number;
  toolBudget: number;
  tokenBudget: number;
};

export type BuildKeeniAgentContextInput = {
  params: KeeniAgentParams;
  draftRequest: DraftRequest;
  personality?: KeeniPersonality;
  maxIterations?: number;
  toolBudget?: number;
  tokenBudget?: number;
};

/** Build agent runtime context — today wraps Vercel AI SDK; Mastra Agent lands in AE-02+. */
export function buildKeeniAgentContext(input: BuildKeeniAgentContextInput): KeeniAgentContext {
  const personality = input.personality ?? buildPersonality();
  const agentSystem = buildAgentSystemPrompt(personality);
  const instruction = [agentSystem, input.draftRequest.instruction].filter(Boolean).join("\n\n");

  return {
    params: input.params,
    personality,
    draftRequest: {
      ...input.draftRequest,
      instruction,
    },
    maxIterations: input.maxIterations ?? 10,
    toolBudget: input.toolBudget ?? 8,
    tokenBudget: input.tokenBudget ?? 6000,
  };
}
