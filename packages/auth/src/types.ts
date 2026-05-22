import type { MemberRole } from "@keenai/shared";

export interface AccessTokenClaims {
  sub: string;
  orgId: string;
  memberId: string;
  role: MemberRole;
  brandIds: string[];
  sessionId: string;
  type: "access";
}

export interface RefreshTokenClaims {
  sub: string;
  sessionId: string;
  type: "refresh";
}

export interface AuthSession {
  accountId: string;
  memberId: string;
  orgId: string;
  role: MemberRole;
  brandIds: string[];
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** Widget visitor JWT lifetime (defaults to accessTtlSec). */
  widgetAccessTtlSec?: number;
  /** Portal customer JWT lifetime (default 7 days). */
  portalAccessTtlSec?: number;
  appUrl: string;
  /** Customer portal base URL for magic links. */
  portalAppUrl?: string;
  smtp?: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    from: string;
  };
}
