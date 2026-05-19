import type { AccessTokenClaims, AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { Store } from "@keenai/storage";
import type { Logger } from "./logger.js";

export type AppVariables = {
  requestId: string;
  auth: AccessTokenClaims | null;
  log: Logger;
  store: Store;
  authConfig: AuthConfig;
  env: ApiEnv;
};

export interface AppContext {
  store: Store;
  authConfig: AuthConfig;
  env: ApiEnv;
  log: Logger;
  startedAt: Date;
}
