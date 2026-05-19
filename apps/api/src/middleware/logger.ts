import { createMiddleware } from "hono/factory";
import type { Logger } from "../logger.js";

export function attachLogger(log: Logger) {
  return createMiddleware(async (c, next) => {
    c.set("log", log);
    const start = Date.now();
    await next();
    log.info(
      {
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      "request",
    );
  });
}
