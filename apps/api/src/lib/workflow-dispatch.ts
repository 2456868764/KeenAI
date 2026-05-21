import {
  createInngestWorkflowDispatch,
  createSyncWorkflowDispatch,
  createWorkflowInngestFunctions,
  type WorkflowDispatchAdapter,
  type WorkflowDispatchHandlers,
} from "@keenai/workflow";
import { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { scanCustomerUnresponsiveWorkflows } from "./workflow-unresponsive-scan.js";
import { dispatchFirstMessageWorkflows } from "./workflow-engine.js";

let adapter: WorkflowDispatchAdapter | null = null;
let inngestClient: Inngest | null = null;
let inngestHandlers: WorkflowDispatchHandlers | null = null;

export function initWorkflowDispatch(ctx: AppContext): WorkflowDispatchAdapter {
  const handlers: WorkflowDispatchHandlers = {
    dispatchFirstMessage: (input) => dispatchFirstMessageWorkflows(ctx.store.db, input),
    scanCustomerUnresponsive: (orgId) =>
      scanCustomerUnresponsiveWorkflows(ctx.store.db, { orgId }).then((result) => ({
        scanned: result.scanned,
        triggered: result.triggered,
        runs: result.runs,
      })),
  };

  inngestHandlers = handlers;

  if (ctx.env.INNGEST_EVENT_KEY) {
    inngestClient = new Inngest({ id: ctx.env.INNGEST_APP_ID });
    adapter = createInngestWorkflowDispatch(
      (payload) => inngestClient!.send(payload),
      handlers,
    );
    return adapter;
  }

  adapter = createSyncWorkflowDispatch(handlers);
  return adapter;
}

export function getWorkflowDispatch(): WorkflowDispatchAdapter {
  if (!adapter) throw new Error("workflow dispatch not initialized");
  return adapter;
}

export function getInngestWorkflowServeHandler() {
  if (!inngestClient || !inngestHandlers) return null;
  return createWorkflowInngestFunctions(inngestClient, inngestHandlers);
}

export function getInngestClient() {
  return inngestClient;
}
