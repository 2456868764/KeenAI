import type { DraftLanguageModel, DraftRequest, DraftToolRuntime } from "@keenai/llm";
import { formatDraftToolSummary } from "@keenai/llm";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { KeeniAgentContext } from "./orchestrator.js";

/** Mastra adapter metadata — AE-03+ adds memory and post-run hooks. */
export const KEENI_AGENT_MASTRA_ADAPTER = {
  enabled: true,
  targetPackage: "@mastra/core/agent",
  notes: "Agent runs via Mastra Agent.stream(); @keenai/llm remains the llm fallback.",
} as const;

export type MastraAgentIdentity = {
  id: string;
  name: string;
  instructions: string;
};

export type BuildKeeniMastraAgentInput = {
  context: KeeniAgentContext;
  model: DraftLanguageModel;
};

/** Build a Mastra Agent for a brand-scoped Keeni run. */
export function buildKeeniMastraAgent(input: BuildKeeniMastraAgentInput): Agent {
  const { context, model } = input;
  const tools = buildMastraTools(context.draftRequest.tools?.slice(0, context.toolBudget));

  return new Agent({
    id: `keeni-${context.params.brandId}`,
    name: context.personality.name,
    description: `Customer support agent for brand ${context.params.brandId}`,
    instructions: context.draftRequest.instruction ?? "",
    model,
    ...(tools ? { tools } : {}),
    defaultOptions: {
      maxSteps: context.maxIterations,
    },
  });
}

/** Design-doc alias for `buildKeeniMastraAgent`. */
export const buildKeeniAgent = buildKeeniMastraAgent;

export function describeMastraAgentIdentity(input: {
  brandId: string;
  name: string;
  instructions: string;
}): MastraAgentIdentity {
  return {
    id: `keeni-${input.brandId}`,
    name: input.name,
    instructions: input.instructions,
  };
}

/** Conversation prompt for Mastra `agent.stream()` (instructions live on the Agent). */
export function buildMastraStreamMessages(req: DraftRequest): string {
  const toolSummary = formatDraftToolSummary(req.tools ?? []);
  const transcript = req.messages
    .map((message) => {
      const imageNote =
        message.images && message.images.length > 0
          ? ` [${message.images.length} image(s) attached]`
          : "";
      return `${message.role === "user" ? "Customer" : "Agent"}: ${message.plainText}${imageNote}`;
    })
    .join("\n");

  return [
    req.memoryContext ? `Relevant memory:\n${req.memoryContext}` : "",
    toolSummary,
    `Conversation subject: ${req.subject ?? "(none)"}`,
    "",
    transcript,
    "",
    "Draft the next agent reply:",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMastraTools(tools: DraftToolRuntime[] | undefined) {
  if (!tools?.length) return undefined;

  return Object.fromEntries(
    tools.map((tool) => [
      tool.name,
      createTool({
        id: tool.name,
        description: tool.description,
        inputSchema: z.record(z.unknown()),
        execute: async (inputData) => tool.execute(inputData as Record<string, unknown>),
      }),
    ]),
  );
}
