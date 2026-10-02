import { createHash } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";

type MetaEnv = Pick<
  ApiEnv,
  | "META_APP_ID"
  | "META_APP_SECRET"
  | "META_EMBEDDED_SIGNUP_CONFIG_ID"
  | "WHATSAPP_VERIFY_TOKEN"
  | "WHATSAPP_GRAPH_API_VERSION"
>;

export function whatsappOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function whatsappSignupConfig(env: MetaEnv) {
  if (
    !env.META_APP_ID ||
    !env.META_APP_SECRET ||
    !env.META_EMBEDDED_SIGNUP_CONFIG_ID ||
    !env.WHATSAPP_VERIFY_TOKEN
  ) {
    throw new Error("whatsapp_signup_not_configured");
  }
  return {
    appId: env.META_APP_ID,
    configId: env.META_EMBEDDED_SIGNUP_CONFIG_ID,
    graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION,
  };
}

export async function installWhatsAppSignup(
  env: MetaEnv,
  input: { code: string; wabaId: string; phoneNumberId: string; pin?: string },
) {
  const config = whatsappSignupConfig(env);
  const appSecret = env.META_APP_SECRET;
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN;
  if (!appSecret || !verifyToken) throw new Error("whatsapp_signup_not_configured");
  const graph = `https://graph.facebook.com/${config.graphApiVersion}`;
  const tokenUrl = new URL(`${graph}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({
    client_id: config.appId,
    client_secret: appSecret,
    code: input.code,
    redirect_uri: "",
  }).toString();
  const tokenResponse = await metaJson(tokenUrl, { method: "GET" });
  const accessToken = field(tokenResponse, "access_token");
  if (!accessToken) throw new Error("whatsapp_signup_token_invalid");

  const debugUrl = new URL(`${graph}/debug_token`);
  debugUrl.search = new URLSearchParams({ input_token: accessToken }).toString();
  const debugResponse = await metaJson(debugUrl, {
    headers: { Authorization: `Bearer ${config.appId}|${appSecret}` },
  });
  const debug = object(debugResponse.data);
  if (debug?.is_valid !== true || debug.app_id !== config.appId) {
    throw new Error("whatsapp_signup_app_mismatch");
  }

  const phonesUrl = new URL(`${graph}/${encodeURIComponent(input.wabaId)}/phone_numbers`);
  phonesUrl.searchParams.set("fields", "id,display_phone_number,verified_name");
  phonesUrl.searchParams.set("limit", "100");
  const phoneResponse = await metaJson(phonesUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const phones = Array.isArray(phoneResponse.data) ? phoneResponse.data : [];
  const phone = phones.map(object).find((item) => item?.id === input.phoneNumberId);
  if (!phone) throw new Error("whatsapp_signup_phone_mismatch");

  if (input.pin) {
    const registered = await metaJson(
      new URL(`${graph}/${encodeURIComponent(input.phoneNumberId)}/register`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin: input.pin }),
      },
    );
    if (!metaSucceeded(registered)) throw new Error("whatsapp_signup_registration_failed");
  }

  const subscribed = await metaJson(
    new URL(`${graph}/${encodeURIComponent(input.wabaId)}/subscribed_apps`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!metaSucceeded(subscribed)) throw new Error("whatsapp_signup_subscription_failed");

  return {
    accountId: input.phoneNumberId,
    name:
      field(phone, "display_phone_number") ??
      field(phone, "verified_name") ??
      `WhatsApp ${input.phoneNumberId}`,
    credentials: {
      accessToken,
      appSecret,
      verifyToken,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      graphApiVersion: config.graphApiVersion,
    },
  };
}

async function metaJson(url: URL, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("whatsapp_signup_provider_unavailable");
  }
  if (!response.ok) throw new Error("whatsapp_signup_provider_rejected");
  const value: unknown = await response.json().catch(() => null);
  const result = object(value);
  if (!result) throw new Error("whatsapp_signup_response_invalid");
  return result;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metaSucceeded(value: Record<string, unknown>): boolean {
  return value.success === true || value.success === "true";
}

function field(value: Record<string, unknown> | null, key: string): string | null {
  const result = value?.[key];
  return typeof result === "string" && result.length > 0 ? result : null;
}
