export type { AccessTokenClaims, AuthConfig, AuthSession } from "./types.js";
export {
  AuthError,
  loginWithMagicLink,
  loginWithPassword,
  logout,
  refreshSession,
} from "./service.js";
export { verifyAccessToken, parseTtlSeconds } from "./jwt.js";
export { createWidgetUserHash, verifyWidgetUserHash } from "./widget-hmac.js";
export {
  DEFAULT_CUSTOM_ACTION_SIGNATURE_HEADER,
  signCustomActionRequest,
  type SignCustomActionRequestInput,
  type SignCustomActionRequestResult,
} from "./custom-action-hmac.js";
export {
  signWidgetAccessToken,
  verifyWidgetAccessToken,
  type WidgetAccessClaims,
} from "./widget-jwt.js";
export {
  signPortalAccessToken,
  verifyPortalAccessToken,
  type PortalAccessClaims,
} from "./portal-jwt.js";
export { hashPassword, verifyPassword } from "./password.js";
export {
  createMagicLink,
  consumeMagicLink,
  sendMagicLinkEmail,
  sendPortalMagicLinkEmail,
} from "./magic-link.js";
export { randomToken } from "./crypto.js";
export { canAccess, createRbacEnforcer, getRbacEnforcer } from "./rbac/enforcer.js";
export { DEFAULT_POLICIES } from "./rbac/model.js";
