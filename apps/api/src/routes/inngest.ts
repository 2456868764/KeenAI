import { serve } from "inngest/hono";
import { Hono } from "hono";
import { getInngestClient, getInngestWorkflowServeHandler } from "../lib/workflow-dispatch.js";

export function inngestRoutes() {
  const r = new Hono();
  const client = getInngestClient();
  const functions = getInngestWorkflowServeHandler();

  if (!client || !functions) return r;

  const handler = serve({ client, functions: [...functions] });
  r.on(["GET", "POST", "PUT"], "/api/inngest", handler);

  return r;
}
