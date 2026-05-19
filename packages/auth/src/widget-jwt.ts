import { SignJWT, jwtVerify } from "jose";
import type { AuthConfig } from "./types.js";

export interface WidgetAccessClaims {
  sub: string;
  orgId: string;
  brandId: string;
  sessionId: string;
  type: "widget";
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signWidgetAccessToken(
  config: AuthConfig,
  claims: Omit<WidgetAccessClaims, "type">,
): Promise<string> {
  const ttl = config.widgetAccessTtlSec ?? config.accessTtlSec;
  return new SignJWT({ ...claims, type: "widget" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setSubject(claims.sub)
    .sign(secretKey(config.jwtSecret));
}

export async function verifyWidgetAccessToken(
  config: AuthConfig,
  token: string,
): Promise<WidgetAccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(config.jwtSecret));
  if (payload.type !== "widget") throw new Error("invalid_token_type");
  return payload as unknown as WidgetAccessClaims;
}
