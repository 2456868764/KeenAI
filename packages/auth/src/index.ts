export type { AccessTokenClaims, AuthConfig, AuthSession } from "./types.js";
export {
  AuthError,
  loginWithMagicLink,
  loginWithPassword,
  logout,
  refreshSession,
} from "./service.js";
export { verifyAccessToken, parseTtlSeconds } from "./jwt.js";
export { hashPassword, verifyPassword } from "./password.js";
export { createMagicLink, consumeMagicLink, sendMagicLinkEmail } from "./magic-link.js";
export { randomToken } from "./crypto.js";
export { canAccess, createRbacEnforcer, getRbacEnforcer } from "./rbac/enforcer.js";
export { DEFAULT_POLICIES } from "./rbac/model.js";
