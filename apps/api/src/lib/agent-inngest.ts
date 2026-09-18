import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { recoverStaleAgentRuns } from "./agent-recovery.js";
import { runDueConversationAutoCloseJobs } from "./conversation-auto-close.js";

export function createAgentInngestFunctions(client: Inngest, ctx: AppContext) {
  return [
    client.createFunction(
      { id: "keenai-agent-recovery-cron" },
      { cron: ctx.env.INNGEST_AGENT_RECOVERY_CRON },
      async () =>
        recoverStaleAgentRuns(ctx.store.db, {
          staleBefore: new Date(Date.now() - ctx.env.AGENT_TOOL_STALE_SECONDS * 1_000),
        }),
    ),
    client.createFunction(
      { id: "keenai-agent-auto-close-cron", retries: 3, concurrency: { limit: 1 } },
      { cron: ctx.env.INNGEST_AGENT_AUTO_CLOSE_CRON },
      async ({ step }) =>
        step.run("run-due-agent-auto-close-jobs", () =>
          runDueConversationAutoCloseJobs(ctx.store.db),
        ),
    ),
  ] as const;
}
