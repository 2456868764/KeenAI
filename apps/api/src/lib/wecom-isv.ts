import type { ApiEnv } from "@keenai/shared";
import type { Store } from "@keenai/storage";
import { getChannelProviderAppState } from "./channel-provider-app-state.js";
import { getWeComCorpAccessToken, getWeComSuiteAccessToken } from "./channel-provider-tokens.js";

type WeComIsvEnv = Pick<ApiEnv, "WECOM_SUITE_ID" | "WECOM_SUITE_SECRET">;

export async function hydrateWeComIsvCredentials(input: {
  store: Store;
  credentials: Record<string, unknown>;
  secret: string;
  env: WeComIsvEnv;
  cacheScope: string;
}): Promise<Record<string, unknown>> {
  if (input.credentials.appType !== "isv") return input.credentials;
  const suiteId = stringValue(input.credentials.suiteId);
  const corpId = stringValue(input.credentials.corpId);
  const permanentCode = stringValue(input.credentials.permanentCode);
  if (!suiteId || !corpId || !permanentCode) throw new Error("wecom_isv_connection_invalid");
  if (!input.env.WECOM_SUITE_ID || !input.env.WECOM_SUITE_SECRET) {
    throw new Error("wecom_isv_not_configured");
  }
  if (suiteId !== input.env.WECOM_SUITE_ID) throw new Error("wecom_isv_suite_mismatch");
  const ticketState = await getChannelProviderAppState({
    store: input.store,
    provider: "wecom",
    appId: suiteId,
    stateType: "suite_ticket",
    secret: input.secret,
  });
  const suiteTicket = stringValue(ticketState?.suiteTicket);
  if (!suiteTicket) throw new Error("wecom_suite_ticket_missing");
  const suiteAccessToken = await getWeComSuiteAccessToken(
    { suiteId, suiteSecret: input.env.WECOM_SUITE_SECRET, suiteTicket },
    input.cacheScope,
  );
  const accessToken = await getWeComCorpAccessToken(
    { suiteAccessToken, authCorpId: corpId, permanentCode },
    input.cacheScope,
  );
  return { ...input.credentials, accessToken };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
