import { createChannelRuntimeRequestSignal } from "./channel-runtime-request.js";
import { TELEGRAM_ALLOWED_UPDATES } from "./telegram-webhook.js";

const DEFAULT_POLL_TIMEOUT_SECONDS = 25;
const DEFAULT_POLL_NETWORK_GRACE_MS = 10_000;
const DEFAULT_CALLBACK_TIMEOUT_MS = 10_000;

export type TelegramPollingFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class TelegramPollingError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs = 5_000,
    readonly clearCursor = false,
  ) {
    super(message);
    this.name = "TelegramPollingError";
  }
}

export async function runTelegramPolling(input: {
  botToken: string;
  initialCursor?: Record<string, unknown>;
  signal: AbortSignal;
  onUpdate(payload: Record<string, unknown>): Promise<void>;
  onHeartbeat(
    cursor: Record<string, unknown>,
    state: "connected" | "reconnecting",
  ): Promise<boolean>;
  fetchFn?: TelegramPollingFetch;
  timeoutSeconds?: number;
  requestTimeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const fetchFn = input.fetchFn ?? fetch;
  let offset = numericOffset(input.initialCursor?.offset);
  const timeoutSeconds = Math.max(1, input.timeoutSeconds ?? DEFAULT_POLL_TIMEOUT_SECONDS);

  while (!input.signal.aborted) {
    const url = new URL(`https://api.telegram.org/bot${input.botToken}/getUpdates`);
    url.searchParams.set("timeout", String(timeoutSeconds));
    url.searchParams.set("allowed_updates", JSON.stringify(TELEGRAM_ALLOWED_UPDATES));
    if (offset !== undefined) url.searchParams.set("offset", String(offset));
    const request = createChannelRuntimeRequestSignal(
      input.signal,
      input.requestTimeoutMs ?? timeoutSeconds * 1_000 + DEFAULT_POLL_NETWORK_GRACE_MS,
    );
    let response: Response;
    try {
      response = await fetchFn(url, { signal: request.signal });
    } catch (error) {
      if (request.timedOut()) throw new TelegramPollingError("telegram_poll_timeout");
      throw error;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
      parameters?: { retry_after?: number };
    };
    if (!response.ok || payload.ok !== true || !Array.isArray(payload.result)) {
      const retryAfterMs = Math.max(1, payload.parameters?.retry_after ?? 5) * 1_000;
      throw new TelegramPollingError(
        `telegram_poll_${response.status}_${payload.description ?? "failed"}`,
        retryAfterMs,
        response.status === 401,
      );
    }

    for (const update of payload.result) {
      if (!update || typeof update !== "object" || Array.isArray(update)) continue;
      const updateId = numericOffset((update as { update_id?: unknown }).update_id);
      if (updateId === undefined) continue;
      const callbackId = callbackQueryId(update);
      await input.onUpdate(update as Record<string, unknown>);
      if (callbackId) {
        await answerTelegramCallbackQuery(
          fetchFn,
          input.botToken,
          callbackId,
          input.signal,
          Math.min(
            input.requestTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS,
            DEFAULT_CALLBACK_TIMEOUT_MS,
          ),
        );
      }
      offset = updateId + 1;
    }
    const cursor = offset === undefined ? {} : { offset };
    if (!(await input.onHeartbeat(cursor, "connected"))) {
      throw new TelegramPollingError("channel_runtime_lease_lost", 0);
    }
  }

  return offset === undefined ? {} : { offset };
}

function callbackQueryId(value: object): string | undefined {
  const callback = (value as { callback_query?: unknown }).callback_query;
  if (!callback || typeof callback !== "object" || Array.isArray(callback)) return undefined;
  const id = (callback as { id?: unknown }).id;
  return typeof id === "string" && id ? id : undefined;
}

export async function answerTelegramCallbackQuery(
  fetchFn: TelegramPollingFetch,
  botToken: string,
  callbackQueryId: string,
  runtimeSignal: AbortSignal = new AbortController().signal,
  timeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS,
): Promise<void> {
  const request = createChannelRuntimeRequestSignal(runtimeSignal, timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
      signal: request.signal,
    });
  } catch (error) {
    if (request.timedOut()) throw new TelegramPollingError("telegram_callback_ack_timeout");
    throw error;
  }
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean };
  if (!response.ok || payload.ok !== true) {
    throw new TelegramPollingError(`telegram_callback_ack_${response.status}`);
  }
}

function numericOffset(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}
