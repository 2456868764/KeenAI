import type { ChannelConnectionConfig } from "@keenai/channels-core";
import { createImapPollClient, createSmtpTransport } from "@keenai/channels-email";
import { getWeChatAccessToken } from "./channel-provider-tokens.js";

export type ChannelConnectionValidationResult = {
  ok: true;
  verification: "provider" | "local" | "configuration_only";
  providerAccountId?: string;
  displayName?: string;
};

export async function validateChannelConnection(
  connection: ChannelConnectionConfig,
): Promise<ChannelConnectionValidationResult> {
  switch (connection.channelType) {
    case "widget":
      return { ok: true, verification: "local", displayName: "KeenAI Messenger" };
    case "email":
      return validateEmail(connection);
    case "telegram":
      return validateTelegram(connection);
    case "slack":
      return validateSlack(connection);
    case "discord":
      return validateDiscord(connection);
    case "feishu":
      return validateFeishu(connection);
    case "dingtalk":
      return validateDingTalk(connection);
    case "whatsapp":
      return validateWhatsApp(connection);
    case "wechat":
      return validateWeChat(connection);
    case "wecom":
      return validateWeCom(connection);
  }
}

async function validateWeChat(connection: ChannelConnectionConfig) {
  const appId = required(connection, "appId");
  required(connection, "callbackToken");
  const encodingAesKey = optional(connection, "encodingAesKey");
  if (encodingAesKey && encodingAesKey.length !== 43) {
    throw new Error("wechat_encoding_aes_key_invalid");
  }
  const token = await getWeChatAccessToken(connection.credentials, connection.connectionId);
  const payload = await providerJson(
    `https://api.weixin.qq.com/cgi-bin/get_api_domain_ip?access_token=${encodeURIComponent(token)}`,
  );
  const errorCode = numberValue(payload.errcode);
  if (errorCode !== undefined && errorCode !== 0) {
    throw new Error(`wechat_${stringValue(payload.errmsg) ?? "auth_failed"}`);
  }
  if (!Array.isArray(payload.ip_list)) {
    throw new Error("wechat_account_verification_failed");
  }
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: appId,
    displayName: `WeChat Official Account ${appId}`,
  };
}

async function validateEmail(
  connection: ChannelConnectionConfig,
): Promise<ChannelConnectionValidationResult> {
  const host = required(connection, "host");
  const port = Number(connection.credentials.port);
  if (!Number.isInteger(port) || port <= 0) throw new Error("email_smtp_port_invalid");
  const transport = createSmtpTransport({
    host,
    port,
    secure:
      typeof connection.credentials.secure === "boolean"
        ? connection.credentials.secure
        : port === 465,
    user: optional(connection, "user"),
    pass: optional(connection, "pass"),
    accessToken: optional(connection, "accessToken"),
    from: required(connection, "from"),
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
  if (connection.transport === "polling") {
    const imapHost = required(connection, "imapHost");
    const imapPort = optionalNumber(connection, "imapPort") ?? 993;
    const client = await createImapPollClient({
      host: imapHost,
      port: imapPort,
      secure: optionalBoolean(connection, "imapSecure") ?? imapPort === 993,
      user: required(connection, "imapUser"),
      ...(optional(connection, "accessToken")
        ? { accessToken: required(connection, "accessToken") }
        : { password: required(connection, "imapPass") }),
    });
    await client.close();
    return { ok: true, verification: "provider", displayName: `${host} / ${imapHost}` };
  }
  return { ok: true, verification: "provider", displayName: host };
}

async function validateTelegram(connection: ChannelConnectionConfig) {
  const payload = await providerJson(
    `https://api.telegram.org/bot${required(connection, "botToken")}/getMe`,
  );
  if (payload.ok !== true || !isRecord(payload.result)) throw new Error("telegram_auth_failed");
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: stringValue(payload.result.id),
    displayName: stringValue(payload.result.username) ?? stringValue(payload.result.first_name),
  };
}

async function validateSlack(connection: ChannelConnectionConfig) {
  const payload = await providerJson("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${required(connection, "botToken")}` },
  });
  if (payload.ok !== true) throw new Error(`slack_${stringValue(payload.error) ?? "auth_failed"}`);
  if (connection.transport === "stream") {
    const socket = await providerJson("https://slack.com/api/apps.connections.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${required(connection, "appToken")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(),
    });
    if (socket.ok !== true || !stringValue(socket.url)?.startsWith("wss://")) {
      throw new Error("slack_socket_auth_failed");
    }
  }
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: stringValue(payload.team_id),
    displayName: stringValue(payload.team) ?? stringValue(payload.user),
  };
}

async function validateDiscord(connection: ChannelConnectionConfig) {
  const payload = await providerJson("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${required(connection, "botToken")}` },
  });
  const botId = stringValue(payload.id);
  if (!botId) throw new Error("discord_bot_identity_missing");
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: botId,
    displayName: stringValue(payload.global_name) ?? stringValue(payload.username),
  };
}

async function validateFeishu(connection: ChannelConnectionConfig) {
  const token = await feishuToken(connection);
  const payload = await providerJson("https://open.feishu.cn/open-apis/bot/v3/info/", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertZeroCode(payload, "feishu_auth_failed");
  const bot = isRecord(payload.bot) ? payload.bot : isRecord(payload.data) ? payload.data : {};
  const botId = stringValue(bot.open_id) ?? stringValue(bot.app_id);
  if (!botId) throw new Error("feishu_bot_identity_missing");
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: botId,
    displayName: stringValue(bot.bot_name) ?? stringValue(bot.name),
  };
}

async function validateDingTalk(connection: ChannelConnectionConfig) {
  if (connection.credentials.appType === "isv") {
    if (!optional(connection, "accessToken")) throw new Error("dingtalk_isv_token_required");
    const corpId = required(connection, "corpId");
    return {
      ok: true as const,
      verification: "provider" as const,
      providerAccountId: corpId,
      displayName: `DingTalk ${corpId}`,
    };
  }
  const appKey = optional(connection, "appKey");
  const appSecret = optional(connection, "appSecret");
  if (!appKey || !appSecret) {
    if (!optional(connection, "signingSecret")) throw new Error("dingtalk_credentials_required");
    return { ok: true as const, verification: "configuration_only" as const };
  }
  const payload = await providerJson("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appKey, appSecret }),
  });
  if (!stringValue(payload.accessToken)) throw new Error("dingtalk_auth_failed");
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: optional(connection, "robotCode") ?? appKey,
  };
}

async function validateWhatsApp(connection: ChannelConnectionConfig) {
  const phoneNumberId = required(connection, "phoneNumberId");
  const version = optional(connection, "graphApiVersion") ?? "v20.0";
  const payload = await providerJson(
    `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}?fields=verified_name,display_phone_number`,
    { headers: { Authorization: `Bearer ${required(connection, "accessToken")}` } },
  );
  const providerPhoneNumberId = stringValue(payload.id);
  if (!providerPhoneNumberId) throw new Error("whatsapp_phone_number_identity_missing");
  if (providerPhoneNumberId !== phoneNumberId) {
    throw new Error("whatsapp_phone_number_identity_mismatch");
  }
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: providerPhoneNumberId,
    displayName: stringValue(payload.verified_name) ?? stringValue(payload.display_phone_number),
  };
}

async function validateWeCom(connection: ChannelConnectionConfig) {
  const token = await wecomToken(connection);
  const rawAgentId = connection.settings.wecomAgentId ?? connection.credentials.agentId;
  if (rawAgentId === undefined) {
    throw new Error("wecom_agent_id_required");
  }
  const agentId = Number(rawAgentId);
  if (!Number.isInteger(agentId) || agentId <= 0) throw new Error("wecom_agent_id_invalid");
  const payload = await providerJson(
    `https://qyapi.weixin.qq.com/cgi-bin/agent/get?access_token=${encodeURIComponent(token)}&agentid=${agentId}`,
  );
  assertWeComOk(payload, "wecom_agent_lookup_failed", true);
  const providerAgentId = numberValue(payload.agentid);
  if (!Number.isInteger(providerAgentId) || providerAgentId !== agentId) {
    throw new Error("wecom_agent_identity_mismatch");
  }
  return {
    ok: true as const,
    verification: "provider" as const,
    providerAccountId: String(agentId),
    displayName: stringValue(payload.name),
  };
}

async function feishuToken(connection: ChannelConnectionConfig): Promise<string> {
  const configured = optional(connection, "tenantAccessToken");
  if (configured) return configured;
  const payload = await providerJson(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: required(connection, "appId"),
        app_secret: required(connection, "appSecret"),
      }),
    },
  );
  const token = stringValue(payload.tenant_access_token);
  if (!token) throw new Error("feishu_auth_failed");
  return token;
}

async function wecomToken(connection: ChannelConnectionConfig): Promise<string> {
  const configured = optional(connection, "accessToken");
  if (configured) return configured;
  const payload = await providerJson(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(required(connection, "corpId"))}&corpsecret=${encodeURIComponent(required(connection, "corpSecret"))}`,
  );
  assertWeComOk(payload, "wecom_auth_failed");
  const token = stringValue(payload.access_token);
  if (!token) throw new Error("wecom_auth_failed");
  return token;
}

async function providerJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload)) throw new Error(`provider_http_${response.status}`);
  return payload;
}

function required(connection: ChannelConnectionConfig, key: string): string {
  const value = optional(connection, key);
  if (!value) throw new Error(`${connection.channelType}_${key}_required`);
  return value;
}

function optional(connection: ChannelConnectionConfig, key: string): string | undefined {
  const value = connection.credentials[key] ?? connection.settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(connection: ChannelConnectionConfig, key: string): number | undefined {
  const value = connection.credentials[key] ?? connection.settings[key];
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${connection.channelType}_${key}_invalid`);
  }
  return number;
}

function optionalBoolean(connection: ChannelConnectionConfig, key: string): boolean | undefined {
  const value = connection.credentials[key] ?? connection.settings[key];
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function assertZeroCode(payload: Record<string, unknown>, fallback: string): void {
  if (payload.code !== 0) throw new Error(fallback);
}

function assertWeComOk(
  payload: Record<string, unknown>,
  fallback: string,
  requireExplicitSuccess = false,
): void {
  if (
    (requireExplicitSuccess && payload.errcode !== 0) ||
    (typeof payload.errcode === "number" && payload.errcode !== 0)
  ) {
    throw new Error(fallback);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
