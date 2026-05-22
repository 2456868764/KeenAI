import { Hono } from "hono";
import { serve } from "inngest/hono";
import { createEmailInngestFunctions } from "../lib/email-inngest.js";
import { getInngestClient, getInngestWorkflowServeHandler } from "../lib/workflow-dispatch.js";
import type { AppContext } from "../types.js";

export function inngestRoutes(ctx: AppContext) {
  const r = new Hono();
  const client = getInngestClient();
  const workflowFunctions = getInngestWorkflowServeHandler(ctx.env.INNGEST_SCAN_CRON);

  if (!client) return r;

  const functions = [...(workflowFunctions ?? []), ...createEmailInngestFunctions(client, ctx)];

  const handler = serve({ client, functions: [...functions] });
  r.on(["GET", "POST", "PUT"], "/api/inngest", handler);

  return r;
}
