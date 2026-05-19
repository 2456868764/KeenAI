import type { MemberRole } from "@keenai/shared";
import { SignJWT, jwtVerify } from "jose";
import type { AccessTokenClaims, AuthConfig, RefreshTokenClaims } from "./types.js";

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  config: AuthConfig,
  claims: Omit<AccessTokenClaims, "type">,
): Promise<string> {
  return new SignJWT({ ...claims, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlSec}s`)
    .setSubject(claims.sub)
    .sign(secretKey(config.jwtSecret));
}

export async function signRefreshToken(
  config: AuthConfig,
  claims: Omit<RefreshTokenClaims, "type">,
): Promise<string> {
  return new SignJWT({ ...claims, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.refreshTtlSec}s`)
    .setSubject(claims.sub)
    .sign(secretKey(config.jwtSecret));
}

export async function verifyAccessToken(
  config: AuthConfig,
  token: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secretKey(config.jwtSecret));
  if (payload.type !== "access") throw new Error("invalid_token_type");
  return payload as unknown as AccessTokenClaims;
}

export async function verifyRefreshToken(
  config: AuthConfig,
  token: string,
): Promise<RefreshTokenClaims> {
  const { payload } = await jwtVerify(token, secretKey(config.jwtSecret));
  if (payload.type !== "refresh") throw new Error("invalid_token_type");
  return payload as unknown as RefreshTokenClaims;
}

export function parseTtlSeconds(value: string, fallback: number): number {
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
}

export type { MemberRole };
