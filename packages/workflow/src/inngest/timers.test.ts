import { Inngest } from "inngest";
import { describe, expect, it } from "vitest";
import { WORKFLOW_INNGEST_EVENTS } from "../adapter/inngest.js";
import {
  DEFAULT_CSAT_WAIT_MS,
  WORKFLOW_AUTO_CLOSE_MINUTE_OPTIONS,
  createWorkflowTimerInngestFunctions,
  stubWorkflowTimerHandlers,
  workflowAutoCloseMsFromMinutes,
} from "./timers.js";

describe("workflow Inngest timers", () => {
  it("registers auto-close and CSAT timer functions", () => {
    const client = new Inngest({ id: "test" });
    const fns = createWorkflowTimerInngestFunctions(client, stubWorkflowTimerHandlers);

    expect(fns).toHaveLength(2);
    expect(fns.map((fn) => fn.id())).toEqual([
      "keenai-workflow-auto-close-timer",
      "keenai-workflow-csat-timer",
    ]);
  });

  it("exports timer events and Featurebase minute options", () => {
    expect(WORKFLOW_INNGEST_EVENTS.STEP_AWAITING_INPUT).toBe("keenai/workflow.step_awaiting_input");
    expect(WORKFLOW_INNGEST_EVENTS.CSAT_REQUEST).toBe("keenai/workflow.csat_request");
    expect(WORKFLOW_AUTO_CLOSE_MINUTE_OPTIONS).toEqual([1, 3, 5, 7, 10, 15, 30, 60]);
    expect(workflowAutoCloseMsFromMinutes(5)).toBe(300_000);
    expect(DEFAULT_CSAT_WAIT_MS).toBeGreaterThan(0);
  });
});
