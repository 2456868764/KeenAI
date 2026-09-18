import { type ChannelConnectionConfig, ChannelPluginRegistry } from "@keenai/channels-core";
import { createEmailChannelPlugin } from "@keenai/channels-email";
import { type ImOutboundAction, createDefaultImPlugins } from "@keenai/channels-im";
import { createWidgetChannelPlugin } from "@keenai/channels-widget";

let registry: ChannelPluginRegistry | null = null;

export function getChannelPluginRegistry(): ChannelPluginRegistry {
  if (registry) return registry;
  const next = new ChannelPluginRegistry();
  for (const plugin of createDefaultImPlugins(executeImActions)) next.register(plugin);
  next.register(createEmailChannelPlugin());
  next.register(
    createWidgetChannelPlugin(async (envelope) => ({
      providerMessageIds: [envelope.messageId],
      acceptedAt: new Date(),
      providerResponse: { transport: "conversation_bus" },
    })),
  );
  registry = next;
  return next;
}

export function resetChannelPluginRegistryForTests(): void {
  registry = null;
}

async function executeImActions(actions: ImOutboundAction[], connection: ChannelConnectionConfig) {
  const providerMessageIds: string[] = [];
  const responses: unknown[] = [];
  for (const [index, action] of actions.entries()) {
    const result = await executeImAction(action, connection);
    responses.push(result.payload);
    providerMessageIds.push(
      result.providerMessageId ?? `${action.platform}:${Date.now()}:${index}`,
    );
  }
  return { providerMessageIds, providerResponse: responses };
}

async function executeImAction(
  action: ImOutboundAction,
  connection: ChannelConnectionConfig,
): Promise<{ providerMessageId?: string; payload: unknown }> {
  if (action.platform === "telegram") {
    const token = credential(connection, "botToken");
    const method = action.method;
    const body: Record<string, unknown> = { chat_id: action.chatId };
    if (method === "sendMessage") body.text = action.text;
    if (method === "sendPhoto")
      Object.assign(body, { photo: action.photoUrl, caption: action.caption });
    if (method === "sendVoice")
      Object.assign(body, { voice: action.voiceUrl, caption: action.caption });
    if (method === "sendVideo")
      Object.assign(body, { video: action.videoUrl, caption: action.caption });
    if (method === "sendDocument") {
      Object.assign(body, { document: action.documentUrl, caption: action.caption });
    }
    const payload = await postJson(`https://api.telegram.org/bot${token}/${method}`, body);
    return { providerMessageId: nestedId(payload, "result", "message_id"), payload };
  }

  if (action.platform === "slack") {
    const token = credential(connection, "botToken");
    const body =
      action.method === "chat.postMessage"
        ? { channel: action.channel, text: action.text }
        : {
            channel: action.channel,
            text: `${action.title ?? action.fileName}\n${action.fileUrl}`,
          };
    const payload = await postJson("https://slack.com/api/chat.postMessage", body, {
      Authorization: `Bearer ${token}`,
    });
    if (isRecord(payload) && payload.ok === false) {
      throw new ChannelProviderHttpError(400, String(payload.error ?? "slack_error"));
    }
    return { providerMessageId: fieldId(payload, "ts"), payload };
  }

  if (action.platform === "discord") {
    const token = credential(connection, "botToken");
    const payload = await postJson(
      `https://discord.com/api/v10/channels/${encodeURIComponent(action.channelId)}/messages`,
      { content: action.content },
      { Authorization: `Bot ${token}` },
    );
    return { providerMessageId: fieldId(payload, "id"), payload };
  }

  if (action.platform === "feishu") {
    const token = await resolveFeishuToken(connection);
    const payload = await postJson(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${action.receiveIdType}`,
      {
        receive_id: action.receiveId,
        msg_type: "text",
        content: JSON.stringify({ text: action.text }),
      },
      { Authorization: `Bearer ${token}` },
    );
    return { providerMessageId: nestedId(payload, "data", "message_id"), payload };
  }

  if (action.platform === "dingtalk") {
    const payload = await postJson(action.sessionWebhook, {
      msgtype: "text",
      text: { content: action.text },
    });
    return { providerMessageId: fieldId(payload, "processQueryKey"), payload };
  }

  if (action.platform === "whatsapp") {
    const token = credential(connection, "accessToken");
    const phoneNumberId = credential(connection, "phoneNumberId");
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: action.to,
    };
    if (action.method === "messages.text") {
      Object.assign(body, { type: "text", text: { body: action.text } });
    } else if (action.method === "messages.image") {
      Object.assign(body, {
        type: "image",
        image: { link: action.imageUrl, caption: action.caption },
      });
    } else if (action.method === "messages.audio") {
      Object.assign(body, { type: "audio", audio: { link: action.audioUrl } });
    } else if (action.method === "messages.video") {
      Object.assign(body, {
        type: "video",
        video: { link: action.videoUrl, caption: action.caption },
      });
    } else {
      Object.assign(body, {
        type: "document",
        document: {
          link: action.documentUrl,
          filename: action.fileName,
          caption: action.caption,
        },
      });
    }
    const version = optionalCredential(connection, "graphApiVersion") ?? "v20.0";
    const payload = await postJson(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      body,
      { Authorization: `Bearer ${token}` },
    );
    return { providerMessageId: firstArrayId(payload, "messages"), payload };
  }

  const accessToken = await resolveWeComToken(connection);
  const payload = await postJson(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      touser: action.toUser,
      msgtype: "text",
      agentid: action.agentId,
      text: { content: action.text },
      safe: 0,
    },
  );
  if (isRecord(payload) && typeof payload.errcode === "number" && payload.errcode !== 0) {
    throw new ChannelProviderHttpError(400, String(payload.errmsg ?? "wecom_error"));
  }
  return { providerMessageId: fieldId(payload, "msgid"), payload };
}

async function resolveFeishuToken(connection: ChannelConnectionConfig): Promise<string> {
  const configured = optionalCredential(connection, "tenantAccessToken");
  if (configured) return configured;
  const appId = credential(connection, "appId");
  const appSecret = credential(connection, "appSecret");
  const payload = await postJson(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    { app_id: appId, app_secret: appSecret },
  );
  const token = isRecord(payload) ? payload.tenant_access_token : undefined;
  if (typeof token !== "string" || !token) {
    throw new ChannelProviderHttpError(401, "feishu_token_exchange_failed");
  }
  return token;
}

async function resolveWeComToken(connection: ChannelConnectionConfig): Promise<string> {
  const configured = optionalCredential(connection, "accessToken");
  if (configured) return configured;
  const corpId = credential(connection, "corpId");
  const corpSecret = credential(connection, "corpSecret");
  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`,
  );
  const payload = await response.json().catch(() => ({ statusText: response.statusText }));
  if (!response.ok || !isRecord(payload) || typeof payload.access_token !== "string") {
    throw new ChannelProviderHttpError(response.status || 502, "wecom_token_exchange_failed");
  }
  return payload.access_token;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ statusText: response.statusText }));
  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    throw new ChannelProviderHttpError(
      response.status,
      `provider_http_${response.status}`,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined,
    );
  }
  return payload;
}

class ChannelProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ChannelProviderHttpError";
  }
}

function credential(connection: ChannelConnectionConfig, key: string): string {
  const value = optionalCredential(connection, key);
  if (!value) throw new ChannelProviderHttpError(400, `${connection.channelType}_${key}_required`);
  return value;
}

function optionalCredential(connection: ChannelConnectionConfig, key: string): string | undefined {
  const value = connection.credentials[key] ?? connection.settings[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function fieldId(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const result = value[key];
  return typeof result === "string" || typeof result === "number" ? String(result) : undefined;
}

function nestedId(value: unknown, parent: string, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  return fieldId(value[parent], key);
}

function firstArrayId(value: unknown, key: string): string | undefined {
  if (!isRecord(value) || !Array.isArray(value[key])) return undefined;
  return fieldId(value[key][0], "id");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
