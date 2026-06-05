/**
 * JSON column type for `workflows.definition`.
 * Duplicated here (not imported from @keenai/workflow) to avoid a Turbo cycle:
 * storage → workflow → agent → memory-tree → kb → storage.
 */
export type WorkflowDefinitionJson = {
  trigger: "first_message" | "customer_unresponsive" | (string & {});
  inactivityMinutes?: number;
  blocks: Array<{
    id: string;
    type: string;
    plainText?: string;
    attachmentIds?: string[];
    assigneeId?: string | null;
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
