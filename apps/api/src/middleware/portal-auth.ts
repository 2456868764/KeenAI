import { type AuthConfig, verifyPortalAccessToken } from "@keenai/auth";
import { createMiddleware } from "hono/factory";

function extractPortalToken(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}): string | undefined {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const queryToken = c.req.query("portal_token");
  return queryToken?.trim() || undefined;
}

export function optionalPortalAuth(config: AuthConfig) {
  return createMiddleware(async (c, next) => {
    const token = extractPortalToken(c);
    if (!token) {
      c.set("portalAuth", null);
      await next();
      return;
    }
    try {
      const claims = await verifyPortalAccessToken(config, token);
      c.set("portalAuth", claims);
    } catch {
      c.set("portalAuth", null);
    }
    await next();
  });
}
