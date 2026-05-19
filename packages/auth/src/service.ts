import { memberRoleSchema } from "@keenai/shared";
import type { KeenaiDb } from "@keenai/storage";
import { accounts, brands, members, organizations, sessions } from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import { randomToken, sha256Hex } from "./crypto.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt.js";
import { verifyPassword } from "./password.js";
import type { AuthConfig, AuthSession } from "./types.js";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_credentials" | "not_found" | "session_revoked" | "forbidden",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

async function brandIdsForOrg(db: KeenaiDb, orgId: string): Promise<string[]> {
  const rows = await db.select({ id: brands.id }).from(brands).where(eq(brands.orgId, orgId));
  return rows.map((r) => r.id);
}

async function resolveMember(db: KeenaiDb, accountId: string, orgSlug?: string) {
  const base = and(eq(members.accountId, accountId), eq(members.status, "active"));

  if (orgSlug) {
    const [row] = await db
      .select({ member: members, org: organizations })
      .from(members)
      .innerJoin(organizations, eq(members.orgId, organizations.id))
      .where(and(base, eq(organizations.slug, orgSlug), isNull(organizations.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select({ member: members, org: organizations })
    .from(members)
    .innerJoin(organizations, eq(members.orgId, organizations.id))
    .where(and(base, isNull(organizations.deletedAt)))
    .limit(1);

  return row ?? null;
}

async function issueSession(
  db: KeenaiDb,
  config: AuthConfig,
  accountId: string,
  memberId: string,
  orgId: string,
  role: string,
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<AuthSession> {
  const parsedRole = memberRoleSchema.parse(role);
  const brandIds = await brandIdsForOrg(db, orgId);
  const sessionId = randomToken(16);
  const expiresAt = new Date(Date.now() + config.refreshTtlSec * 1000);

  const refreshJwt = await signRefreshToken(config, {
    sub: accountId,
    sessionId,
  });
  const refreshTokenHash = await sha256Hex(refreshJwt);

  await db.insert(sessions).values({
    id: sessionId,
    accountId,
    refreshTokenHash,
    expiresAt,
    userAgent: meta?.userAgent,
    ipAddress: meta?.ipAddress,
  });

  const accessToken = await signAccessToken(config, {
    sub: accountId,
    orgId,
    memberId,
    role: parsedRole,
    brandIds,
    sessionId,
  });

  return {
    accountId,
    memberId,
    orgId,
    role: parsedRole,
    brandIds,
    sessionId,
    accessToken,
    refreshToken: refreshJwt,
    expiresAt,
  };
}

export async function loginWithPassword(
  db: KeenaiDb,
  config: AuthConfig,
  input: { email: string; password: string; orgSlug?: string },
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<AuthSession> {
  const email = input.email.toLowerCase();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);

  if (!account?.passwordHash) {
    throw new AuthError("Invalid email or password", "invalid_credentials");
  }

  const valid = await verifyPassword(input.password, account.passwordHash);
  if (!valid) throw new AuthError("Invalid email or password", "invalid_credentials");

  const resolved = await resolveMember(db, account.id, input.orgSlug);
  if (!resolved) throw new AuthError("No workspace membership", "not_found");

  return issueSession(
    db,
    config,
    account.id,
    resolved.member.id,
    resolved.org.id,
    resolved.member.role,
    meta,
  );
}

export async function loginWithMagicLink(
  db: KeenaiDb,
  config: AuthConfig,
  email: string,
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<AuthSession> {
  const normalized = email.toLowerCase();
  let [account] = await db.select().from(accounts).where(eq(accounts.email, normalized)).limit(1);

  if (!account) {
    const [inserted] = await db
      .insert(accounts)
      .values({
        email: normalized,
        name: normalized.split("@")[0] ?? "User",
      })
      .returning();
    if (!inserted) throw new AuthError("Could not create account", "not_found");
    account = inserted;
  }

  const resolved = await resolveMember(db, account.id);
  if (!resolved) {
    throw new AuthError(
      "No workspace membership — run `bun run seed` or invite this user",
      "not_found",
    );
  }

  return issueSession(
    db,
    config,
    account.id,
    resolved.member.id,
    resolved.org.id,
    resolved.member.role,
    meta,
  );
}

export async function refreshSession(
  db: KeenaiDb,
  config: AuthConfig,
  refreshToken: string,
): Promise<AuthSession> {
  const claims = await verifyRefreshToken(config, refreshToken);
  const tokenHash = await sha256Hex(refreshToken);

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, claims.sessionId))
    .limit(1);

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.refreshTokenHash !== tokenHash
  ) {
    throw new AuthError("Session revoked", "session_revoked");
  }

  const resolved = await resolveMember(db, claims.sub);
  if (!resolved) throw new AuthError("Member not found", "not_found");

  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));

  return issueSession(
    db,
    config,
    claims.sub,
    resolved.member.id,
    resolved.org.id,
    resolved.member.role,
  );
}

export async function logout(db: KeenaiDb, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}
