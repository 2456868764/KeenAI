const TELEGRAM_API_BASE = "https://api.telegram.org";
export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
  "message_reaction",
  "callback_query",
] as const;

export type TelegramWebhookFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type TelegramTransportLifecycleResult = {
  providerAction: "setWebhook" | "deleteWebhook";
  webhookUrl: string | null;
  pendingUpdateCount: number;
};

export function buildTelegramWebhookUrl(input: {
  baseUrl: string;
  orgSlug: string;
  brandSlug: string;
  connectionId: string;
}): string {
  const base = new URL(input.baseUrl);
  if (base.protocol !== "https:") throw new Error("telegram_webhook_url_https_required");
  const url = new URL("/api/v1/webhooks/im/telegram", base);
  url.searchParams.set("org", input.orgSlug);
  url.searchParams.set("brand", input.brandSlug);
  url.searchParams.set("connection", input.connectionId);
  return url.toString();
}

export async function reconcileTelegramTransport(input: {
  botToken: string;
  transport: "webhook" | "polling";
  webhookUrl?: string;
  webhookSecret?: string;
  fetchFn?: TelegramWebhookFetch;
}): Promise<TelegramTransportLifecycleResult> {
  const fetchFn = input.fetchFn ?? fetch;
  if (input.transport === "webhook") {
    if (!input.webhookUrl) throw new Error("telegram_webhook_base_url_required");
    const webhookUrl = new URL(input.webhookUrl);
    if (webhookUrl.protocol !== "https:") throw new Error("telegram_webhook_url_https_required");
    const secret = input.webhookSecret?.trim();
    if (!secret) throw new Error("telegram_webhook_secret_required");
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
      throw new Error("telegram_webhook_secret_invalid");
    }
    await telegramMethod(fetchFn, input.botToken, "setWebhook", {
      url: webhookUrl.toString(),
      secret_token: secret,
      allowed_updates: TELEGRAM_ALLOWED_UPDATES,
      drop_pending_updates: false,
    });
  } else {
    await telegramMethod(fetchFn, input.botToken, "deleteWebhook", {
      drop_pending_updates: false,
    });
  }

  const info = await telegramMethod(fetchFn, input.botToken, "getWebhookInfo");
  if (!isRecord(info)) throw new Error("telegram_webhook_info_invalid");
  const actualUrl = stringValue(info.url) ?? "";
  const expectedUrl = input.transport === "webhook" ? input.webhookUrl : undefined;
  if (expectedUrl && actualUrl !== new URL(expectedUrl).toString()) {
    throw new Error("telegram_webhook_url_mismatch");
  }
  if (input.transport === "polling" && actualUrl) {
    throw new Error("telegram_webhook_delete_not_applied");
  }
  return {
    providerAction: input.transport === "webhook" ? "setWebhook" : "deleteWebhook",
    webhookUrl: actualUrl || null,
    pendingUpdateCount: numberValue(info.pending_update_count) ?? 0,
  };
}

async function telegramMethod(
  fetchFn: TelegramWebhookFetch,
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("telegram_provider_unavailable");
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const record = isRecord(payload) ? payload : null;
  if (!response.ok || record?.ok !== true) {
    const description = stringValue(record?.description)?.replace(/[\r\n]/g, " ");
    throw new Error(`telegram_${method}_${description ?? response.status}`);
  }
  return record.result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
