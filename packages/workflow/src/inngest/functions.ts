import { Inngest } from "inngest";
import { WORKFLOW_INNGEST_EVENTS } from "../adapter/inngest.js";
import type { WorkflowDispatchHandlers } from "../adapter/types.js";
import {
  type WorkflowTimerHandlers,
  createWorkflowTimerInngestFunctions,
  stubWorkflowTimerHandlers,
} from "./timers.js";

/** Default Inngest cron — every 5 minutes */
export const WORKFLOW_SCAN_CRON_DEFAULT = "*/5 * * * *";

export type WorkflowInngestOptions = {
  scanCron?: string;
};

export type WorkflowInngestHandlers = WorkflowDispatchHandlers & Partial<WorkflowTimerHandlers>;

export function createWorkflowInngestFunctions(
  client: Inngest,
  handlers: WorkflowInngestHandlers,
  opts?: WorkflowInngestOptions,
) {
  const scanCron = opts?.scanCron ?? WORKFLOW_SCAN_CRON_DEFAULT;
  const timerHandlers: WorkflowTimerHandlers = {
    ...stubWorkflowTimerHandlers,
    ...handlers,
  };

  const firstMessage = client.createFunction(
    { id: "keenai-workflow-first-message", retries: 3, concurrency: { limit: 20 } },
    { event: WORKFLOW_INNGEST_EVENTS.FIRST_MESSAGE },
    async ({ event, step }) => {
      const data = event.data as {
        orgId: string;
        brandId: string;
        conversationId: string;
      };
      await step.run("dispatch-first-message", () => handlers.dispatchFirstMessage(data));
    },
  );

  const scanUnresponsive = client.createFunction(
    { id: "keenai-workflow-scan-unresponsive", retries: 2, concurrency: { limit: 5 } },
    { event: WORKFLOW_INNGEST_EVENTS.SCAN_UNRESPONSIVE },
    async ({ event, step }) => {
      const orgId = (event.data as { orgId?: string }).orgId;
      return step.run("scan-unresponsive", () => handlers.scanCustomerUnresponsive(orgId));
    },
  );

  const scanUnresponsiveCron = client.createFunction(
    { id: "keenai-workflow-scan-unresponsive-cron", retries: 2, concurrency: { limit: 1 } },
    { cron: scanCron },
    async ({ step }) =>
      step.run("scan-unresponsive-cron", () => handlers.scanCustomerUnresponsive(undefined)),
  );

  const timerFunctions = createWorkflowTimerInngestFunctions(client, timerHandlers);

  return [firstMessage, scanUnresponsive, scanUnresponsiveCron, ...timerFunctions] as const;
}

export function createInngestClient(appId = "keenai") {
  return new Inngest({ id: appId });
}
