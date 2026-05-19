import { type AuthConfig, verifyWidgetAccessToken } from "@keenai/auth";
import { createMiddleware } from "hono/factory";

function extractWidgetToken(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}): string | undefined {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const queryToken = c.req.query("widget_token");
  return queryToken?.trim() || undefined;
}

export function optionalWidgetAuth(config: AuthConfig) {
  return createMiddleware(async (c, next) => {
    const token = extractWidgetToken(c);
    if (!token) {
      c.set("widgetAuth", null);
      await next();
      return;
    }
    try {
      const claims = await verifyWidgetAccessToken(config, token);
      c.set("widgetAuth", claims);
    } catch {
      c.set("widgetAuth", null);
    }
    await next();
  });
}

export function requireWidgetAuth() {
  return createMiddleware(async (c, next) => {
    const auth = c.get("widgetAuth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    await next();
  });
}
