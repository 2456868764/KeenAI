import {
  type WorkflowDispatchAdapter,
  type WorkflowInngestHandlers,
  createInngestWorkflowDispatch,
  createSyncWorkflowDispatch,
  createWorkflowInngestFunctions,
} from "@keenai/workflow";
import { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { dispatchFirstMessageWorkflows } from "./workflow-engine.js";
import { resumeCollectDataWorkflow } from "./workflow-resume.js";
import { createWorkflowTimerHandlers } from "./workflow-timer-handlers.js";
import { scanCustomerUnresponsiveWorkflows } from "./workflow-unresponsive-scan.js";

let adapter: WorkflowDispatchAdapter | null = null;
let inngestClient: Inngest | null = null;
let inngestHandlers: WorkflowInngestHandlers | null = null;

export function initWorkflowDispatch(ctx: AppContext): WorkflowDispatchAdapter {
  const timerHandlers = createWorkflowTimerHandlers(ctx.store.db, ctx.env);

  const handlers: WorkflowInngestHandlers = {
    dispatchFirstMessage: async (input) => {
      await dispatchFirstMessageWorkflows(ctx.store.db, input, ctx.env, ctx.authConfig);
    },
    scanCustomerUnresponsive: (orgId) =>
      scanCustomerUnresponsiveWorkflows(ctx.store.db, {
        orgId,
        env: ctx.env,
        authConfig: ctx.authConfig,
      }).then((result) => ({
        scanned: result.scanned,
        triggered: result.triggered,
        runs: result.runs,
      })),
    runAutoCloseTimer: timerHandlers.runAutoCloseTimer,
    runCsatTimer: timerHandlers.runCsatTimer,
    resumeCollectData: (payload) =>
      resumeCollectDataWorkflow(
        ctx.store.db,
        {
          orgId: payload.orgId,
          workflowRunId: payload.workflowRunId,
          blockId: payload.blockId,
          attributes: payload.attributes,
          freeText: payload.freeText,
        },
        ctx.env,
        ctx.authConfig,
      ),
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
