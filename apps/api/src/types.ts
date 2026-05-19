import type { AccessTokenClaims, AuthConfig, WidgetAccessClaims } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { FTSStore, Store } from "@keenai/storage";
import type { Logger } from "./logger.js";

export type AppVariables = {
  requestId: string;
  auth: AccessTokenClaims | null;
  widgetAuth: WidgetAccessClaims | null;
  log: Logger;
  store: Store;
  authConfig: AuthConfig;
  env: ApiEnv;
};

export interface AppContext {
  store: Store;
  fts: FTSStore | null;
  authConfig: AuthConfig;
  env: ApiEnv;
  log: Logger;
  startedAt: Date;
}
