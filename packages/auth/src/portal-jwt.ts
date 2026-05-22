import { SignJWT, jwtVerify } from "jose";
import type { AuthConfig } from "./types.js";

export interface PortalAccessClaims {
  sub: string;
  orgId: string;
  orgSlug: string;
  brandId: string;
  type: "portal";
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signPortalAccessToken(
  config: AuthConfig,
  claims: Omit<PortalAccessClaims, "type">,
): Promise<string> {
  const ttl = config.portalAccessTtlSec ?? 604_800;
  return new SignJWT({ ...claims, type: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setSubject(claims.sub)
    .sign(secretKey(config.jwtSecret));
}

export async function verifyPortalAccessToken(
  config: AuthConfig,
  token: string,
): Promise<PortalAccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(config.jwtSecret));
  if (payload.type !== "portal") throw new Error("invalid_token_type");
  return payload as unknown as PortalAccessClaims;
}
