import type { ApiEnv } from "@keenai/shared";
import type { Store } from "@keenai/storage";
import { getChannelProviderAppState } from "./channel-provider-app-state.js";
import { getFeishuIsvTenantAccessToken } from "./channel-provider-tokens.js";

type FeishuIsvEnv = Pick<ApiEnv, "FEISHU_ISV_APP_ID" | "FEISHU_ISV_APP_SECRET">;

export async function hydrateFeishuIsvCredentials(input: {
  store: Store;
  credentials: Record<string, unknown>;
  secret: string;
  env: FeishuIsvEnv;
  cacheScope: string;
}): Promise<Record<string, unknown>> {
  if (input.credentials.appType !== "isv") return input.credentials;
  const appId = stringValue(input.credentials.appId);
  const tenantKey = stringValue(input.credentials.tenantKey);
  if (!appId || !tenantKey) throw new Error("feishu_isv_connection_invalid");
  if (!input.env.FEISHU_ISV_APP_ID || !input.env.FEISHU_ISV_APP_SECRET) {
    throw new Error("feishu_isv_not_configured");
  }
  if (appId !== input.env.FEISHU_ISV_APP_ID) throw new Error("feishu_isv_app_mismatch");

  const ticketState = await getChannelProviderAppState({
    store: input.store,
    provider: "feishu",
    appId,
    stateType: "app_ticket",
    secret: input.secret,
  });
  const appTicket = stringValue(ticketState?.appTicket);
  if (!appTicket) throw new Error("feishu_isv_app_ticket_missing");
  const tenantAccessToken = await getFeishuIsvTenantAccessToken(
    {
      appId,
      appSecret: input.env.FEISHU_ISV_APP_SECRET,
      appTicket,
      tenantKey,
    },
    input.cacheScope,
  );
  return { ...input.credentials, tenantAccessToken };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
