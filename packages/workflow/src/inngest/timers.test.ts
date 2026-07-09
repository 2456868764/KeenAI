import { Inngest } from "inngest";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_INNGEST_EVENTS } from "../adapter/inngest.js";
import {
  DEFAULT_CSAT_WAIT_MS,
  WORKFLOW_AUTO_CLOSE_MINUTE_OPTIONS,
  createWorkflowTimerInngestFunctions,
  sleepUntilWorkflowDeadline,
  stubWorkflowTimerHandlers,
  waitForWorkflowInputEvent,
  workflowAutoCloseMsFromMinutes,
  workflowTimerDeadline,
  workflowTimerDuration,
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

  it("builds Inngest waitForEvent and sleepUntil calls for suspended workflow input", async () => {
    const waitForEvent = vi.fn(async () => null);
    const sleepUntil = vi.fn(async () => undefined);

    await waitForWorkflowInputEvent(
      { waitForEvent },
      {
        id: "await-input",
        event: WORKFLOW_INNGEST_EVENTS.ATTRIBUTE_SUBMITTED,
        timeoutMs: 90_000,
        blockId: "collect",
      },
    );
    await sleepUntilWorkflowDeadline({ sleepUntil }, "deadline", 90_000);

    expect(workflowTimerDuration(90_000)).toBe("90s");
    expect(workflowTimerDeadline(90_000, 1_000).toISOString()).toBe(new Date(91_000).toISOString());
    expect(waitForEvent).toHaveBeenCalledWith("await-input", {
      event: WORKFLOW_INNGEST_EVENTS.ATTRIBUTE_SUBMITTED,
      timeout: "90s",
      if: "event.data.workflowRunId == async.data.workflowRunId && event.data.blockId == async.data.blockId",
    });
    expect(sleepUntil).toHaveBeenCalledWith("deadline", expect.any(Date));
  });
});
