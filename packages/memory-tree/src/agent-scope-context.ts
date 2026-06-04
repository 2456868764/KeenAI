import type { KeenaiDb } from "@keenai/storage";
import {
  type AssembleMemoryContextInput,
  type AssembleMemoryContextResult,
  type MemoryContextSection,
  assembleMemoryContext,
} from "./assemble-context.js";
import type { MemoryScope } from "./scope-router.js";
import { resolveDigestDateFromInstruction, resolveMemoryScope } from "./scope-router.js";
import { defaultDigestDateUtc } from "./utc-date.js";

export const KEENI_MEMORY_TREE_MT06 = {
  enabled: true,
  target: "agent.assembleMemoryContext",
  notes: "MT-06 stub: 09 appendix B scope routing → Memory Tree context sections.",
} as const;

export type AgentScopeContextLoader =
  | "conversation_tree"
  | "customer_tree"
  | "brand_daily_digest"
  | "l3_facts"
  | "kb_search";

export type AgentScopeContextPlan = {
  scope: MemoryScope;
  signals: string[];
  loaders: AgentScopeContextLoader[];
  dateUtc?: string;
};

export type AssembleAgentMemoryContextResult = AssembleMemoryContextResult & {
  plan: AgentScopeContextPlan;
};

/** Build which context loaders apply for the resolved agent scope (09 appendix B). */
export function buildAgentScopeContextPlan(input: {
  instruction?: string;
  userId?: string | null;
  dateUtc?: string;
}): AgentScopeContextPlan {
  const { scope, signals } = resolveMemoryScope({ instruction: input.instruction });

  if (scope === "kb_only") {
    return { scope, signals, loaders: ["kb_search"] };
  }

  if (scope === "conversation") {
    return { scope, signals, loaders: ["conversation_tree", "l3_facts"] };
  }

  if (scope === "customer") {
    const loaders: AgentScopeContextLoader[] = input.userId ? ["customer_tree", "l3_facts"] : [];
    return { scope, signals, loaders };
  }

  if (scope === "brand_daily") {
    const dateUtc =
      resolveDigestDateFromInstruction(input.instruction, input.dateUtc) ?? defaultDigestDateUtc();
    return { scope, signals, loaders: ["brand_daily_digest"], dateUtc };
  }

  const dateUtc =
    resolveDigestDateFromInstruction(input.instruction, input.dateUtc) ?? defaultDigestDateUtc();
  const loaders: AgentScopeContextLoader[] = ["conversation_tree", "brand_daily_digest"];
  if (input.userId) loaders.push("l3_facts");
  return { scope, signals, loaders, dateUtc };
}

/** MT-06 stub entry: route agent scope then assemble Memory Tree + optional KB context. */
export async function assembleAgentMemoryContext(
  db: KeenaiDb,
  input: AssembleMemoryContextInput,
): Promise<AssembleAgentMemoryContextResult> {
  const plan = buildAgentScopeContextPlan({
    instruction: input.instruction,
    userId: input.userId,
    dateUtc: input.dateUtc,
  });

  const result = await assembleMemoryContext(db, input);
  return { ...result, plan };
}

export type { MemoryContextSection };
