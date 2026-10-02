import type { ImPendingAttachment } from "@keenai/channels-im";
import type { ApiEnv } from "@keenai/shared";
import {
  getDingTalkAccessToken,
  getFeishuTenantAccessToken,
  getWeChatAccessToken,
  getWeComAccessToken,
} from "./channel-provider-tokens.js";

const STUB_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const STUB_WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);

/** Download IM platform media into local bytes (stub when tokens unset). */
export async function downloadImAttachment(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown> = {},
): Promise<Uint8Array> {
  if (attachment.sizeBytes && attachment.sizeBytes > env.UPLOAD_MAX_BYTES) {
    throw new Error("im_attachment_too_large");
  }
  if (attachment.content) {
    if (attachment.content.byteLength > env.UPLOAD_MAX_BYTES) {
      throw new Error("im_attachment_too_large");
    }
    return attachment.content;
  }

  if (attachment.platform === "telegram") {
    return downloadTelegramFile(env, attachment, credentials);
  }

  if (attachment.platform === "whatsapp") {
    return downloadWhatsAppMedia(env, attachment, credentials);
  }

  if (attachment.platform === "slack") {
    return downloadSlackFile(env, attachment, credentials);
  }

  if (attachment.platform === "feishu") {
    return downloadFeishuFile(env, attachment, credentials);
  }

  if (attachment.platform === "dingtalk") {
    return downloadDingTalkFile(env, attachment, credentials);
  }

  if (attachment.platform === "wechat") {
    return downloadWeChatFile(env, attachment, credentials);
  }

  if (attachment.platform === "wecom") {
    return downloadWeComFile(env, attachment, credentials);
  }

  return downloadPublicFile(env, attachment);
}

async function downloadTelegramFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  const token = credential(credentials, "botToken") ?? env.TELEGRAM_BOT_TOKEN;
  if (!token) return missingCredential(env, attachment, "telegram_bot_token_missing");

  const fileRes = await fetchWithTimeout(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(attachment.platformRef)}`,
  );
  if (!fileRes.ok) throw new Error("telegram_get_file_failed");

  const fileBody = (await fileRes.json()) as { ok?: boolean; result?: { file_path?: string } };
  const filePath = fileBody.result?.file_path;
  if (!filePath) throw new Error("telegram_missing_file_path");

  const contentRes = await fetchWithTimeout(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
  );
  if (!contentRes.ok) throw new Error("telegram_download_failed");
  return readResponseBytes(contentRes, env.UPLOAD_MAX_BYTES);
}

async function downloadSlackFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  const token = credential(credentials, "botToken") ?? env.SLACK_BOT_TOKEN;
  if (!token) return missingCredential(env, attachment, "slack_bot_token_missing");

  let url = attachment.platformRef;
  if (!url.startsWith("http")) {
    const infoResponse = await fetchWithTimeout(
      `https://slack.com/api/files.info?file=${encodeURIComponent(attachment.platformRef)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const info = (await infoResponse.json().catch(() => null)) as {
      ok?: boolean;
      file?: { url_private_download?: string; url_private?: string };
    } | null;
    if (!infoResponse.ok || info?.ok !== true) throw new Error("slack_file_lookup_failed");
    url = info.file?.url_private_download ?? info.file?.url_private ?? "";
    if (!url.startsWith("https://")) throw new Error("slack_file_url_missing");
  }

  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("slack_download_failed");
  return readResponseBytes(res, env.UPLOAD_MAX_BYTES);
}

async function downloadWhatsAppMedia(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  const token = credential(credentials, "accessToken") ?? env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return missingCredential(env, attachment, "whatsapp_access_token_missing");

  const version =
    credential(credentials, "graphApiVersion") ?? env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0";
  const metaRes = await fetchWithTimeout(
    `https://graph.facebook.com/${version}/${encodeURIComponent(attachment.platformRef)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!metaRes.ok) throw new Error("whatsapp_media_lookup_failed");

  const meta = (await metaRes.json()) as { url?: string };
  if (!meta.url?.startsWith("https://")) throw new Error("whatsapp_media_url_missing");

  const contentRes = await fetchWithTimeout(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!contentRes.ok) throw new Error("whatsapp_media_download_failed");
  return readResponseBytes(contentRes, env.UPLOAD_MAX_BYTES);
}

async function downloadFeishuFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  if (
    !credential(credentials, "tenantAccessToken") &&
    !(credential(credentials, "appId") && credential(credentials, "appSecret"))
  ) {
    return missingCredential(env, attachment, "feishu_credentials_missing");
  }
  const token = await getFeishuTenantAccessToken(credentials, "im-download");
  let reference: { messageId?: string; resourceKey?: string; resourceType?: string };
  try {
    reference = JSON.parse(attachment.platformRef) as typeof reference;
  } catch {
    throw new Error("feishu_attachment_reference_invalid");
  }
  if (!reference.messageId || !reference.resourceKey) {
    throw new Error("feishu_attachment_reference_invalid");
  }
  const response = await fetchWithTimeout(
    `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(reference.messageId)}/resources/${encodeURIComponent(reference.resourceKey)}?type=${reference.resourceType === "image" ? "image" : "file"}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("feishu_download_failed");
  return readResponseBytes(response, env.UPLOAD_MAX_BYTES);
}

async function downloadDingTalkFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  const reference = dingtalkAttachmentReference(attachment.platformRef);
  const hasTokenCredentials =
    Boolean(credential(credentials, "accessToken")) ||
    Boolean(credential(credentials, "appKey") && credential(credentials, "appSecret"));
  const robotCode = reference.robotCode ?? credential(credentials, "robotCode");
  if (!hasTokenCredentials || !robotCode) {
    return missingCredential(env, attachment, "dingtalk_media_credentials_missing");
  }
  const accessToken = await getDingTalkAccessToken(credentials, "im-download");
  const lookupResponse = await fetchWithTimeout(
    "https://api.dingtalk.com/v1.0/robot/messageFiles/download",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": accessToken,
      },
      body: JSON.stringify({ downloadCode: reference.downloadCode, robotCode }),
    },
  );
  const lookup = (await lookupResponse.json()) as { downloadUrl?: string };
  if (!lookupResponse.ok || !lookup.downloadUrl) throw new Error("dingtalk_download_url_failed");
  const response = await fetchWithTimeout(lookup.downloadUrl);
  if (!response.ok) throw new Error("dingtalk_download_failed");
  return readResponseBytes(response, env.UPLOAD_MAX_BYTES);
}

function dingtalkAttachmentReference(platformRef: string): {
  downloadCode: string;
  robotCode?: string;
} {
  try {
    const parsed = JSON.parse(platformRef) as { downloadCode?: unknown; robotCode?: unknown };
    if (typeof parsed.downloadCode === "string" && parsed.downloadCode.trim()) {
      return {
        downloadCode: parsed.downloadCode,
        robotCode:
          typeof parsed.robotCode === "string" && parsed.robotCode.trim()
            ? parsed.robotCode
            : undefined,
      };
    }
  } catch {
    // Legacy attachment references stored only the provider download code.
  }
  return { downloadCode: platformRef };
}

async function downloadWeComFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  if (/^https:\/\//i.test(attachment.platformRef)) return downloadPublicFile(env, attachment);
  if (
    !credential(credentials, "accessToken") &&
    !(credential(credentials, "corpId") && credential(credentials, "corpSecret"))
  ) {
    return missingCredential(env, attachment, "wecom_media_credentials_missing");
  }
  const token = await getWeComAccessToken(credentials, "im-download");
  const response = await fetchWithTimeout(
    `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${encodeURIComponent(token)}&media_id=${encodeURIComponent(attachment.platformRef)}`,
  );
  if (!response.ok || response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("wecom_download_failed");
  }
  return readResponseBytes(response, env.UPLOAD_MAX_BYTES);
}

async function downloadWeChatFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  credentials: Record<string, unknown>,
): Promise<Uint8Array> {
  if (
    !credential(credentials, "accessToken") &&
    !(credential(credentials, "appId") && credential(credentials, "appSecret"))
  ) {
    return missingCredential(env, attachment, "wechat_media_credentials_missing");
  }
  const token = await getWeChatAccessToken(credentials, "im-download");
  const response = await fetchWithTimeout(
    `https://api.weixin.qq.com/cgi-bin/media/get?access_token=${encodeURIComponent(token)}&media_id=${encodeURIComponent(attachment.platformRef)}`,
  );
  if (!response.ok || response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("wechat_download_failed");
  }
  return readResponseBytes(response, env.UPLOAD_MAX_BYTES);
}

async function downloadPublicFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
): Promise<Uint8Array> {
  if (!/^https:\/\//i.test(attachment.platformRef)) {
    if (env.NODE_ENV === "test") return stubBytesForMime(attachment.contentType);
    throw new Error(`${attachment.platform}_attachment_url_missing`);
  }
  const response = await fetchWithTimeout(attachment.platformRef);
  if (!response.ok) throw new Error(`${attachment.platform}_download_failed`);
  return readResponseBytes(response, env.UPLOAD_MAX_BYTES);
}

const INBOUND_ATTACHMENT_TIMEOUT_MS = 30_000;

function fetchWithTimeout(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(INBOUND_ATTACHMENT_TIMEOUT_MS),
  });
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error("im_attachment_too_large");
  }
  if (!response.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("im_attachment_too_large");
        throw new Error("im_attachment_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function missingCredential(
  env: ApiEnv,
  attachment: ImPendingAttachment,
  errorCode: string,
): Uint8Array {
  if (env.NODE_ENV === "test") return stubBytesForMime(attachment.contentType);
  throw new Error(errorCode);
}

function credential(credentials: Record<string, unknown>, key: string): string | undefined {
  const value = credentials[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stubBytesForMime(contentType: string): Uint8Array {
  const mime = contentType.toLowerCase();
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return STUB_WEBM;
  return STUB_PNG;
}
