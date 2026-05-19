import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types.js";

export function injectContext(ctx: AppContext) {
  return createMiddleware(async (c, next) => {
    c.set("store", ctx.store);
    c.set("authConfig", ctx.authConfig);
    c.set("env", ctx.env);
    await next();
  });
}
