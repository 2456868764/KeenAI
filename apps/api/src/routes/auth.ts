import { zValidator } from "@hono/zod-validator";
import {
  AuthError,
  consumeMagicLink,
  createMagicLink,
  loginWithMagicLink,
  loginWithPassword,
  logout,
  refreshSession,
  sendMagicLinkEmail,
} from "@keenai/auth";
import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "../types.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  orgSlug: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const magicRequestSchema = z.object({
  email: z.string().email(),
});

const magicVerifySchema = z.object({
  token: z.string().min(10),
});

function sessionResponse(session: Awaited<ReturnType<typeof loginWithPassword>>) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt.toISOString(),
    orgId: session.orgId,
    memberId: session.memberId,
    role: session.role,
    brandIds: session.brandIds,
  };
}

export function authRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();

  const prefix = `/api/${API_VERSION}/auth`;

  r.post(`${prefix}/login`, zValidator("json", loginSchema), async (c) => {
    const body = c.req.valid("json");
    try {
      const session = await loginWithPassword(c.get("store").db, c.get("authConfig"), body, {
        userAgent: c.req.header("user-agent"),
        ipAddress: c.req.header("x-forwarded-for"),
      });
      return c.json(sessionResponse(session));
    } catch (e) {
      if (e instanceof AuthError) {
        return c.json(
          { error: e.code, message: e.message },
          e.code === "invalid_credentials" ? 401 : 404,
        );
      }
      throw e;
    }
  });

  r.post(`${prefix}/refresh`, zValidator("json", refreshSchema), async (c) => {
    try {
      const session = await refreshSession(
        c.get("store").db,
        c.get("authConfig"),
        c.req.valid("json").refreshToken,
      );
      return c.json(sessionResponse(session));
    } catch (e) {
      if (e instanceof AuthError) {
        return c.json({ error: e.code }, 401);
      }
      throw e;
    }
  });

  r.post(`${prefix}/logout`, async (c) => {
    const auth = c.get("auth");
    if (auth) await logout(c.get("store").db, auth.sessionId);
    return c.json({ ok: true });
  });

  r.post(`${prefix}/magic-link`, zValidator("json", magicRequestSchema), async (c) => {
    const { email } = c.req.valid("json");
    const { token } = await createMagicLink(c.get("store").db, email);
    const result = await sendMagicLinkEmail(c.get("authConfig"), email, token);

    if (!result.sent && result.devUrl) {
      c.get("log").info({ email, magicLink: result.devUrl }, "magic_link_dev");
    }

    return c.json({ ok: true, sent: result.sent });
  });

  r.post(`${prefix}/magic-link/verify`, zValidator("json", magicVerifySchema), async (c) => {
    const email = await consumeMagicLink(c.get("store").db, c.req.valid("json").token);
    if (!email) return c.json({ error: "invalid_or_expired_token" }, 401);

    try {
      const session = await loginWithMagicLink(c.get("store").db, c.get("authConfig"), email);
      return c.json(sessionResponse(session));
    } catch (e) {
      if (e instanceof AuthError) {
        return c.json({ error: e.code, message: e.message }, 404);
      }
      throw e;
    }
  });

  return r;
}
