import type { Inngest } from "inngest";
import { WORKFLOW_INNGEST_EVENTS } from "../adapter/inngest.js";
import type { WorkflowDispatchHandlers } from "../adapter/types.js";

/** Default Inngest cron — every 5 minutes */
export const WORKFLOW_SCAN_CRON_DEFAULT = "*/5 * * * *";

export type WorkflowInngestOptions = {
  scanCron?: string;
};

export function createWorkflowInngestFunctions(
  client: Inngest,
  handlers: WorkflowDispatchHandlers,
  opts?: WorkflowInngestOptions,
) {
  const scanCron = opts?.scanCron ?? WORKFLOW_SCAN_CRON_DEFAULT;

  const firstMessage = client.createFunction(
    { id: "keenai-workflow-first-message" },
    { event: WORKFLOW_INNGEST_EVENTS.FIRST_MESSAGE },
    async ({ event }) => {
      await handlers.dispatchFirstMessage(
        event.data as {
          orgId: string;
          brandId: string;
          conversationId: string;
        },
      );
    },
  );

  const scanUnresponsive = client.createFunction(
    { id: "keenai-workflow-scan-unresponsive" },
    { event: WORKFLOW_INNGEST_EVENTS.SCAN_UNRESPONSIVE },
    async ({ event }) => {
      const orgId = (event.data as { orgId?: string }).orgId;
      return handlers.scanCustomerUnresponsive(orgId);
    },
  );

  const scanUnresponsiveCron = client.createFunction(
    { id: "keenai-workflow-scan-unresponsive-cron" },
    { cron: scanCron },
    async () => handlers.scanCustomerUnresponsive(undefined),
  );

  return [firstMessage, scanUnresponsive, scanUnresponsiveCron] as const;
}

export function createInngestClient(appId = "keenai") {
  return new Inngest({ id: appId });
}
