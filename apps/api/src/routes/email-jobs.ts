import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { runEmailImapPoll } from "../lib/email-imap-poll.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function emailJobRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();

  r.post(`/api/${API_VERSION}/email/jobs/imap-poll`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const result = await runEmailImapPoll(ctx.env);
    return c.json({ orgId: auth.orgId, ...result });
  });

  return r;
}
