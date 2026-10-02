import type { ApiEnv } from "@keenai/shared";
import type { Store } from "@keenai/storage";
import { type ChannelConnectionRow, channelConnections } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { getChannelProviderAppState } from "./channel-provider-app-state.js";
import { getDingTalkIsvCorpAccessToken } from "./channel-provider-tokens.js";

type DingTalkIsvEnv = Pick<ApiEnv, "DINGTALK_ISV_SUITE_KEY" | "DINGTALK_ISV_SUITE_SECRET">;

export async function hydrateDingTalkIsvCredentials(input: {
  store: Store;
  credentials: Record<string, unknown>;
  secret: string;
  env: DingTalkIsvEnv;
  cacheScope: string;
}): Promise<Record<string, unknown>> {
  if (input.credentials.appType !== "isv") return input.credentials;
  const suiteKey = stringValue(input.credentials.suiteKey);
  const corpId = stringValue(input.credentials.corpId);
  if (!suiteKey || !corpId) throw new Error("dingtalk_isv_connection_invalid");
  if (!input.env.DINGTALK_ISV_SUITE_KEY || !input.env.DINGTALK_ISV_SUITE_SECRET) {
    throw new Error("dingtalk_isv_not_configured");
  }
  if (suiteKey !== input.env.DINGTALK_ISV_SUITE_KEY) {
    throw new Error("dingtalk_isv_suite_mismatch");
  }
  const ticketState = await getChannelProviderAppState({
    store: input.store,
    provider: "dingtalk",
    appId: suiteKey,
    stateType: "suite_ticket",
    secret: input.secret,
  });
  const suiteTicket = stringValue(ticketState?.suiteTicket);
  if (!suiteTicket) throw new Error("dingtalk_suite_ticket_missing");
  const accessToken = await getDingTalkIsvCorpAccessToken(
    {
      suiteKey,
      suiteSecret: input.env.DINGTALK_ISV_SUITE_SECRET,
      suiteTicket,
      authCorpId: corpId,
    },
    input.cacheScope,
  );
  return {
    ...input.credentials,
    appKey: suiteKey,
    appSecret: input.env.DINGTALK_ISV_SUITE_SECRET,
    accessToken,
  };
}

export async function listDingTalkIsvRuntimeOwners(store: Store): Promise<ChannelConnectionRow[]> {
  const rows = await store.db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.channelType, "dingtalk"),
        eq(channelConnections.transport, "stream"),
        eq(channelConnections.status, "active"),
      ),
    );
  const owners = new Map<string, ChannelConnectionRow>();
  for (const row of rows) {
    if (row.settings.appType !== "isv") continue;
    const suiteKey = stringValue(row.settings.suiteKey);
    if (!suiteKey) continue;
    const current = owners.get(suiteKey);
    if (!current || row.id.localeCompare(current.id) < 0) owners.set(suiteKey, row);
  }
  return [...owners.values()];
}

export async function resolveDingTalkIsvConnection(input: {
  store: Store;
  suiteKey: string;
  corpId: string;
}): Promise<ChannelConnectionRow> {
  const matches = await input.store.db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.channelType, "dingtalk"),
        eq(channelConnections.externalAccountId, input.corpId),
        eq(channelConnections.status, "active"),
      ),
    );
  const routed = matches.filter(
    (row) =>
      row.settings.appType === "isv" && stringValue(row.settings.suiteKey) === input.suiteKey,
  );
  if (routed.length > 1) throw new Error("ambiguous_channel_connection");
  const connection = routed[0];
  if (!connection) throw new Error("channel_not_configured");
  return connection;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
