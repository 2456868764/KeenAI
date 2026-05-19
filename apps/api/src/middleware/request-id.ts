import { randomToken } from "@keenai/auth";
import { createMiddleware } from "hono/factory";

export const requestId = () =>
  createMiddleware(async (c, next) => {
    const id = c.req.header("x-request-id") ?? randomToken(8);
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    await next();
  });
