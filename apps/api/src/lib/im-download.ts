import type { ImPendingAttachment } from "@keenai/channels-im";
import type { ApiEnv } from "@keenai/shared";

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
): Promise<Uint8Array> {
  if (attachment.content) return attachment.content;

  if (attachment.platform === "telegram") {
    return downloadTelegramFile(env, attachment);
  }

  return downloadSlackFile(env, attachment);
}

async function downloadTelegramFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
): Promise<Uint8Array> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return stubBytesForMime(attachment.contentType);

  const fileRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(attachment.platformRef)}`,
  );
  if (!fileRes.ok) throw new Error("telegram_get_file_failed");

  const fileBody = (await fileRes.json()) as { ok?: boolean; result?: { file_path?: string } };
  const filePath = fileBody.result?.file_path;
  if (!filePath) throw new Error("telegram_missing_file_path");

  const contentRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!contentRes.ok) throw new Error("telegram_download_failed");
  return new Uint8Array(await contentRes.arrayBuffer());
}

async function downloadSlackFile(
  env: ApiEnv,
  attachment: ImPendingAttachment,
): Promise<Uint8Array> {
  const token = env.SLACK_BOT_TOKEN;
  if (!token) return stubBytesForMime(attachment.contentType);

  const url = attachment.platformRef.startsWith("http")
    ? attachment.platformRef
    : `https://slack.com/api/files.info?file=${encodeURIComponent(attachment.platformRef)}`;

  if (!url.startsWith("http")) return stubBytesForMime(attachment.contentType);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("slack_download_failed");
  return new Uint8Array(await res.arrayBuffer());
}

function stubBytesForMime(contentType: string): Uint8Array {
  const mime = contentType.toLowerCase();
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return STUB_WEBM;
  return STUB_PNG;
}
