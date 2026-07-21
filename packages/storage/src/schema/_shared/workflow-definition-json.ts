/**
 * JSON column type for `workflows.definition`.
 * Duplicated here (not imported from @keenai/workflow) to avoid a Turbo cycle:
 * storage → workflow → agent → memory-tree → kb → storage.
 */
export type WorkflowDefinitionJson = {
  description?: string;
  trigger: "first_message" | "customer_unresponsive" | (string & {});
  inactivityMinutes?: number;
  pageRules?: Array<{ urlOp: "contains" | "eq" | "matches"; url: string; timeOnPageSec?: number }>;
  eventName?: string;
  cron?: string;
  audience?: {
    match?: "all" | "any";
    rules?: Array<{ field: string; op: string; value?: unknown }>;
  };
  blocks: Array<{
    id: string;
    type: string;
    plainText?: string;
    attachmentIds?: string[];
    assigneeId?: string | null;
    teamId?: string | null;
    strategy?: "direct" | "round_robin" | "least_busy";
    instructions?: string;
    maxSteps?: number;
    toolFilter?: string[];
    outcomeRouting?: {
      resolvedNext: string | null;
      unresolvedNext: string | null;
      escalatedNext: string | null;
    };
    [key: string]: unknown;
  }>;
};
