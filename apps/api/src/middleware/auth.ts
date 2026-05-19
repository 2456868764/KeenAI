import { type AuthConfig, verifyAccessToken } from "@keenai/auth";
import { createMiddleware } from "hono/factory";

function extractAccessToken(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}): string | undefined {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const queryToken = c.req.query("access_token");
  return queryToken?.trim() || undefined;
}

export function optionalAuth(config: AuthConfig) {
  return createMiddleware(async (c, next) => {
    const token = extractAccessToken(c);
    if (!token) {
      c.set("auth", null);
      await next();
      return;
    }
    try {
      const claims = await verifyAccessToken(config, token);
      c.set("auth", claims);
    } catch {
      c.set("auth", null);
    }
    await next();
  });
}

export function requireAuth() {
  return createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    await next();
  });
}
