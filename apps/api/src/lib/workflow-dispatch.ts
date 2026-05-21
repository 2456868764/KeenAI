import {
  type WorkflowDispatchAdapter,
  type WorkflowDispatchHandlers,
  createInngestWorkflowDispatch,
  createSyncWorkflowDispatch,
  createWorkflowInngestFunctions,
} from "@keenai/workflow";
import { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { dispatchFirstMessageWorkflows } from "./workflow-engine.js";
import { scanCustomerUnresponsiveWorkflows } from "./workflow-unresponsive-scan.js";

let adapter: WorkflowDispatchAdapter | null = null;
let inngestClient: Inngest | null = null;
let inngestHandlers: WorkflowDispatchHandlers | null = null;

export function initWorkflowDispatch(ctx: AppContext): WorkflowDispatchAdapter {
  const handlers: WorkflowDispatchHandlers = {
    dispatchFirstMessage: async (input) => {
      await dispatchFirstMessageWorkflows(ctx.store.db, input);
    },
    scanCustomerUnresponsive: (orgId) =>
      scanCustomerUnresponsiveWorkflows(ctx.store.db, { orgId }).then((result) => ({
        scanned: result.scanned,
        triggered: result.triggered,
        runs: result.runs,
      })),
  };

  inngestHandlers = handlers;

  if (ctx.env.INNGEST_EVENT_KEY) {
    const client = new Inngest({ id: ctx.env.INNGEST_APP_ID });
    inngestClient = client;
    adapter = createInngestWorkflowDispatch(async (payload) => {
      await client.send(payload);
    }, handlers);
    return adapter;
  }

  adapter = createSyncWorkflowDispatch(handlers);
  return adapter;
}

export function getWorkflowDispatch(): WorkflowDispatchAdapter {
  if (!adapter) throw new Error("workflow dispatch not initialized");
  return adapter;
}

export function getInngestWorkflowServeHandler(scanCron?: string) {
  if (!inngestClient || !inngestHandlers) return null;
  return createWorkflowInngestFunctions(inngestClient, inngestHandlers, { scanCron });
}

export function getInngestClient() {
  return inngestClient;
}
