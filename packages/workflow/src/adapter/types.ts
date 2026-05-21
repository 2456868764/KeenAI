export type WorkflowDispatchContext = {
  orgId: string;
  brandId: string;
  conversationId: string;
};

export type UnresponsiveScanSummary = {
  mode: "sync" | "inngest";
  scanned?: number;
  triggered: number;
  runs?: string[];
  queued?: boolean;
};

export type WorkflowDispatchHandlers = {
  dispatchFirstMessage(ctx: WorkflowDispatchContext): Promise<void>;
  scanCustomerUnresponsive(orgId?: string): Promise<Omit<UnresponsiveScanSummary, "mode">>;
};

export type WorkflowDispatchAdapter = WorkflowDispatchHandlers & {
  readonly mode: "sync" | "inngest";
};
