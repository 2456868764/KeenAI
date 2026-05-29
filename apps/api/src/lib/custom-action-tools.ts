import type { DraftToolRuntime } from "@keenai/llm";
import type { KeenaiDb } from "@keenai/storage";
import { customActions } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import {
  type ExecuteCustomActionDeps,
  executeCustomActionHttpDirect,
} from "./custom-action-executor.js";

const MAX_COPILOT_TOOLS = 20;

export async function loadCustomActionDraftTools(
  db: KeenaiDb,
  input: { orgId: string; brandId: string },
  deps: Pick<ExecuteCustomActionDeps, "fetch" | "getSecret">,
): Promise<DraftToolRuntime[]> {
  const rows = await db
    .select()
    .from(customActions)
    .where(
      and(
        eq(customActions.orgId, input.orgId),
        eq(customActions.brandId, input.brandId),
        eq(customActions.enabled, true),
        eq(customActions.sandbox, "http_direct"),
      ),
    )
    .limit(MAX_COPILOT_TOOLS);

  return rows.map((row) => ({
    name: row.name,
    description: [row.description, row.whenToUse].filter(Boolean).join(" — ") || row.name,
    parametersSchema: row.parametersSchema,
    execute: async (args: Record<string, unknown>) => {
      const result = await executeCustomActionHttpDirect(
        row,
        { parameters: args },
        { fetch: deps.fetch, getSecret: deps.getSecret },
      );
      return result.data;
    },
  }));
}
