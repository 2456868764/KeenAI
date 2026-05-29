import type { DraftToolRuntime } from "./types.js";

type ToolSet = NonNullable<Parameters<Awaited<typeof import("ai")>["streamText"]>[0]["tools"]>;

/** Build Vercel AI SDK tool map from copilot custom action definitions. */
export async function buildDraftToolSet(tools: DraftToolRuntime[]): Promise<ToolSet> {
  if (tools.length === 0) return {};

  const { jsonSchema, tool } = await import("ai");
  const entries = tools.map((definition) => [
    definition.name,
    tool({
      description: definition.description,
      parameters: jsonSchema(definition.parametersSchema),
      execute: async (args: unknown) => definition.execute(args as Record<string, unknown>),
    }),
  ]);

  return Object.fromEntries(entries) as ToolSet;
}

export function formatDraftToolSummary(tools: DraftToolRuntime[]): string {
  if (tools.length === 0) return "";
  return `Available tools: ${tools.map((t) => t.name).join(", ")}`;
}
