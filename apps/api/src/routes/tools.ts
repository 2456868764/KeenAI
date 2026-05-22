import { zValidator } from "@hono/zod-validator";
import { API_VERSION, textToSpeechSchema } from "@keenai/shared";
import { Hono } from "hono";
import { runTextToSpeechTool } from "../lib/agent-tools/text-to-speech.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function toolRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/tools`;

  r.post(
    `${prefix}/text-to-speech`,
    requireAuth(),
    zValidator("json", textToSpeechSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      try {
        const result = await runTextToSpeechTool(
          c.get("store").db,
          ctx.env,
          auth.orgId,
          c.req.valid("json"),
        );
        return c.json(result, 201);
      } catch (e) {
        if (e instanceof Error && e.message === "openai_api_key_required") {
          return c.json({ error: "openai_api_key_required" }, 503);
        }
        if (e instanceof Error && e.message.startsWith("tts_failed:")) {
          return c.json({ error: "tts_failed" }, 502);
        }
        throw e;
      }
    },
  );

  return r;
}
