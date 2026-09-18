import type { DraftToolRuntime } from "@keenai/llm";
import type { KeenaiDb } from "@keenai/storage";
import { type CustomActionRow, customActions } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import {
  type CustomActionCallContext,
  executeAndLogCustomAction,
} from "./custom-action-call-log.js";
import type { ExecuteCustomActionDeps } from "./custom-action-executor.js";

const MAX_COPILOT_TOOLS = 20;

export function customActionRisk(method: string): "r0" | "r2" | "r3" {
  const normalized = method.toUpperCase();
  if (normalized === "GET" || normalized === "HEAD") return "r0";
  if (normalized === "DELETE") return "r3";
  return "r2";
}

export function createCustomActionDraftTool(
  db: KeenaiDb,
  row: CustomActionRow,
  input: {
    orgId: string;
    source: CustomActionCallContext["source"];
    triggeredBy?: string | null;
    conversationId?: string | null;
    timeoutMs?: number;
  },
  deps: Pick<ExecuteCustomActionDeps, "fetch" | "getSecret">,
  options: { otelEnabled?: boolean; resultMode?: "data" | "envelope" } = {},
): DraftToolRuntime {
  return {
    name: row.name,
    description: [row.description, row.whenToUse].filter(Boolean).join(" — ") || row.name,
    parametersSchema: row.parametersSchema,
    audit: {
      source: "custom_action" as const,
      sourceId: row.id,
      riskLevel: customActionRisk(row.method),
      idempotent: ["GET", "HEAD", "PUT", "DELETE"].includes(row.method.toUpperCase()),
    },
    execute: async (args: Record<string, unknown>) => {
      const context: CustomActionCallContext = {
        orgId: input.orgId,
        brandId: row.brandId,
        source: input.source,
        triggeredBy: input.triggeredBy,
        conversationId: input.conversationId,
      };
      const result = await executeAndLogCustomAction(
        db,
        row,
        context,
        { parameters: args, timeoutMs: input.timeoutMs },
        deps,
        { otelEnabled: options.otelEnabled },
      );
      return options.resultMode === "envelope" ? result : result.data;
    },
  };
}

export async function loadCustomActionDraftTools(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId: string;
    conversationId?: string;
    triggeredBy?: string | null;
  },
  deps: Pick<ExecuteCustomActionDeps, "fetch" | "getSecret">,
  options: { otelEnabled?: boolean } = {},
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

  return rows.map((row) =>
    createCustomActionDraftTool(
      db,
      row,
      {
        orgId: input.orgId,
        source: "copilot",
        triggeredBy: input.triggeredBy,
        conversationId: input.conversationId,
      },
      deps,
      options,
    ),
  );
}
