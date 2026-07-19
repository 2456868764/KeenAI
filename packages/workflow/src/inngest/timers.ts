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
  blockId?: string;
  awaitEvent?: WorkflowAwaitedInputEvent;
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
  sleepUntil: (id: string, date: Date) => Promise<unknown>;
  waitForEvent: <T = unknown>(
    id: string,
    opts: { event: string; timeout: string; if?: string },
  ) => Promise<T | null>;
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

export type WorkflowAwaitedInputEvent =
  | typeof WORKFLOW_INNGEST_EVENTS.ATTRIBUTE_SUBMITTED
  | typeof WORKFLOW_INNGEST_EVENTS.BUTTON_CLICKED
  | typeof WORKFLOW_INNGEST_EVENTS.CSAT_RATED
  | typeof WORKFLOW_INNGEST_EVENTS.CUSTOMER_REPLY_RECEIVED;

export function workflowTimerDuration(milliseconds: number): string {
  return `${Math.max(1, Math.floor(milliseconds / 1000))}s`;
}

export function workflowTimerDeadline(milliseconds: number, now = Date.now()): Date {
  return new Date(now + Math.max(1_000, milliseconds));
}

function workflowInputMatchExpression(payload: { blockId?: string }): string {
  const runMatch = "event.data.workflowRunId == async.data.workflowRunId";
  if (!payload.blockId) return runMatch;
  return `${runMatch} && event.data.blockId == async.data.blockId`;
}

export async function waitForWorkflowInputEvent(
  step: Pick<TimerStep, "waitForEvent">,
  input: {
    id: string;
    event: WorkflowAwaitedInputEvent;
    timeoutMs: number;
    blockId?: string;
  },
) {
  return step.waitForEvent(input.id, {
    event: input.event,
    timeout: workflowTimerDuration(input.timeoutMs),
    if: workflowInputMatchExpression({ blockId: input.blockId }),
  });
}

export async function sleepUntilWorkflowDeadline(
  step: Pick<TimerStep, "sleepUntil">,
  id: string,
  timeoutMs: number,
) {
  return step.sleepUntil(id, workflowTimerDeadline(timeoutMs));
}

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
      if (data.awaitEvent) {
        const received = await waitForWorkflowInputEvent(timerStep, {
          id: "await-customer-input-event",
          event: data.awaitEvent,
          timeoutMs: data.autoCloseMs,
          blockId: data.blockId,
        });
        if (received) {
          return { closed: false, skipped: true, reason: "input_received" };
        }
      } else {
        await timerStep.sleep("await-customer-input", workflowTimerDuration(data.autoCloseMs));
      }
      await sleepUntilWorkflowDeadline(timerStep, "auto-close-deadline", data.autoCloseMs);
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
        const received = await waitForWorkflowInputEvent(timerStep, {
          id: "await-csat-rating-event",
          event: WORKFLOW_INNGEST_EVENTS.CSAT_RATED,
          timeoutMs: waitMs,
          blockId: data.stepId,
        });
        if (!received) {
          await sleepUntilWorkflowDeadline(timerStep, "csat-rating-deadline", waitMs);
        }
      }

      return timerStep.run("csat-timer", () => handlers.runCsatTimer(data));
    },
  );

  return [autoCloseTimer, csatTimer] as const;
}
