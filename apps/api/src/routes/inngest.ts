import { Hono } from "hono";
import { serve } from "inngest/hono";
import { getInngestClient, getInngestWorkflowServeHandler } from "../lib/workflow-dispatch.js";
import type { AppContext } from "../types.js";

export function inngestRoutes(ctx: AppContext) {
  const r = new Hono();
  const client = getInngestClient();
  const functions = getInngestWorkflowServeHandler(ctx.env.INNGEST_SCAN_CRON);

  if (!client || !functions) return r;

  const handler = serve({ client, functions: [...functions] });
  r.on(["GET", "POST", "PUT"], "/api/inngest", handler);

  return r;
}
