import type { Inngest } from "inngest";
import { WORKFLOW_INNGEST_EVENTS } from "../adapter/inngest.js";

/** Featurebase-aligned auto-close minute options. */
export const WORKFLOW_AUTO_CLOSE_MINUTE_OPTIONS = [1, 3, 5, 7, 10, 15, 30, 60] as const;

export const DEFAULT_CSAT_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkflowAutoClosePayload = {
  workflowRunId: string;
  conversationId: string;
  orgId: string;
  brandId: string;
  autoCloseMs: number;
};

export type WorkflowAutoCloseResult = {
  closed: boolean;
  skipped?: boolean;
  reason?: string;
};

export type WorkflowCsatTimerPayload = {
  workflowRunId: string;
  conversationId: string;
  orgId: string;
  brandId: string;
  stepId: string;
  waitForRating?: boolean;
  waitForRatingMs?: number;
};

export type WorkflowCsatTimerResult = {
  rated: boolean;
  rating?: number;
  timedOut?: boolean;
  reason?: string;
};

export type WorkflowTimerHandlers = {
  runAutoCloseTimer: (payload: WorkflowAutoClosePayload) => Promise<WorkflowAutoCloseResult>;
  runCsatTimer: (payload: WorkflowCsatTimerPayload) => Promise<WorkflowCsatTimerResult>;
};

export const stubWorkflowTimerHandlers: WorkflowTimerHandlers = {
  runAutoCloseTimer: async (payload) => ({
    closed: false,
    skipped: !payload.autoCloseMs,
    reason: "stub",
  }),
  runCsatTimer: async (payload) => ({
    rated: false,
    timedOut: Boolean(payload.waitForRating),
    reason: "stub",
  }),
};

export function workflowAutoCloseMsFromMinutes(minutes: number): number {
  return minutes * 60 * 1000;
}

type TimerStep = {
  sleep: (id: string, duration: string) => Promise<unknown>;
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

/** Inngest timer functions for workflow auto-close and CSAT wait. */
export function createWorkflowTimerInngestFunctions(
  client: Inngest,
  handlers: WorkflowTimerHandlers,
) {
  const autoCloseTimer = client.createFunction(
    { id: "keenai-workflow-auto-close-timer" },
    { event: WORKFLOW_INNGEST_EVENTS.STEP_AWAITING_INPUT },
    async ({ event, step }) => {
      const data = event.data as WorkflowAutoClosePayload;
      if (!data.autoCloseMs || data.autoCloseMs <= 0) {
        return handlers.runAutoCloseTimer(data);
      }

      const timerStep = step as TimerStep;
      await timerStep.sleep(
        "await-customer-input",
        `${Math.max(1, Math.floor(data.autoCloseMs / 1000))}s`,
      );
      return timerStep.run("auto-close", () => handlers.runAutoCloseTimer(data));
    },
  );

  const csatTimer = client.createFunction(
    { id: "keenai-workflow-csat-timer" },
    { event: WORKFLOW_INNGEST_EVENTS.CSAT_REQUEST },
    async ({ event, step }) => {
      const data = event.data as WorkflowCsatTimerPayload;
      const timerStep = step as TimerStep;

      if (data.waitForRating) {
        const waitMs = data.waitForRatingMs ?? DEFAULT_CSAT_WAIT_MS;
        await timerStep.sleep("await-csat-rating", `${Math.max(1, Math.floor(waitMs / 1000))}s`);
      }

      return timerStep.run("csat-timer", () => handlers.runCsatTimer(data));
    },
  );

  return [autoCloseTimer, csatTimer] as const;
}
