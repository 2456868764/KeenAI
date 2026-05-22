import type { KeenaiDb } from "@keenai/storage";
import { magicLinks } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { randomToken, sha256Hex } from "./crypto.js";
import type { AuthConfig } from "./types.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function createMagicLink(
  db: KeenaiDb,
  email: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(24);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  await db.insert(magicLinks).values({
    email: email.toLowerCase(),
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumeMagicLink(db: KeenaiDb, token: string): Promise<string | null> {
  const tokenHash = await sha256Hex(token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.consumedAt || row.expiresAt < now) return null;

  await db.update(magicLinks).set({ consumedAt: now }).where(eq(magicLinks.id, row.id));

  return row.email;
}

export async function sendMagicLinkEmail(
  config: AuthConfig,
  email: string,
  token: string,
): Promise<{ sent: boolean; devUrl?: string }> {
  const url = `${config.appUrl}/auth/magic?token=${encodeURIComponent(token)}`;

  if (!config.smtp) {
    return { sent: false, devUrl: url };
  }

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  });

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: "Sign in to KeenAI",
    text: `Sign in to KeenAI:\n\n${url}\n\nThis link expires in 15 minutes.`,
    html: `<p><a href="${url}">Sign in to KeenAI</a></p><p>Expires in 15 minutes.</p>`,
  });

  return { sent: true };
}

export async function sendPortalMagicLinkEmail(
  config: AuthConfig,
  email: string,
  token: string,
  orgSlug: string,
): Promise<{ sent: boolean; devUrl?: string }> {
  const base = config.portalAppUrl ?? config.appUrl;
  const url = `${base}/auth/verify?token=${encodeURIComponent(token)}&org=${encodeURIComponent(orgSlug)}`;

  if (!config.smtp) {
    return { sent: false, devUrl: url };
  }

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  });

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: "Sign in to your support portal",
    text: `View your tickets:\n\n${url}\n\nThis link expires in 15 minutes.`,
    html: `<p><a href="${url}">View your tickets</a></p><p>Expires in 15 minutes.</p>`,
  });

  return { sent: true };
}
