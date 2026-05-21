import { serve } from "inngest/hono";
import { Hono } from "hono";
import type { AppContext } from "../types.js";
import { getInngestClient, getInngestWorkflowServeHandler } from "../lib/workflow-dispatch.js";

export function inngestRoutes(ctx: AppContext) {
  const r = new Hono();
  const client = getInngestClient();
  const functions = getInngestWorkflowServeHandler(ctx.env.INNGEST_SCAN_CRON);

  if (!client || !functions) return r;

  const handler = serve({ client, functions: [...functions] });
  r.on(["GET", "POST", "PUT"], "/api/inngest", handler);

  return r;
}
