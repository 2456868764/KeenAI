import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiEnv } from "@keenai/shared";
import { findRepoRoot } from "@keenai/shared";

const uploadsModuleDir = path.dirname(fileURLToPath(import.meta.url));

const pending = new Map<
  string,
  {
    storageKey: string;
    contentType: string;
    fileName: string;
    expiresAt: number;
    purpose: "message_attachment";
  }
>();

export function resolveUploadDir(env: ApiEnv): string {
  if (env.UPLOAD_DIR) return path.resolve(env.UPLOAD_DIR);
  return path.join(findRepoRoot(uploadsModuleDir), "data", "uploads");
}

export function createPresignedUpload(
  env: ApiEnv,
  input: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
    purpose?: "message_attachment";
  },
  apiBaseUrl: string,
) {
  if (input.sizeBytes > env.UPLOAD_MAX_BYTES) {
    throw new Error("file_too_large");
  }
  if (!isAllowedUploadMime(input.contentType)) {
    throw new Error("unsupported_mime_type");
  }

  const uploadId = randomBytes(16).toString("hex");
  const ext = path.extname(input.fileName).slice(0, 32);
  const storageKey = `${uploadId}${ext}`;
  const expiresAt = Date.now() + 15 * 60_000;

  pending.set(uploadId, {
    storageKey,
    contentType: input.contentType,
    fileName: input.fileName,
    expiresAt,
    purpose: input.purpose ?? "message_attachment",
  });

  return {
    uploadId,
    storageKey,
    uploadUrl: `${apiBaseUrl}/api/v1/uploads/${uploadId}`,
    expiresAt: new Date(expiresAt).toISOString(),
    maxBytes: env.UPLOAD_MAX_BYTES,
    purpose: input.purpose ?? "message_attachment",
  };
}

export function consumePresignedUpload(uploadId: string) {
  const entry = pending.get(uploadId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pending.delete(uploadId);
    return null;
  }
  pending.delete(uploadId);
  return entry;
}

export async function saveUploadFile(
  env: ApiEnv,
  storageKey: string,
  body: Uint8Array,
): Promise<string> {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("invalid_storage_key");
  }
  const dir = resolveUploadDir(env);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, storageKey);
  await writeFile(filePath, body);
  return filePath;
}

export function fileChecksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

const STORAGE_KEY_RE = /^[a-f0-9]{32}(\.[a-zA-Z0-9]{1,32})?$/;

export function isValidStorageKey(storageKey: string): boolean {
  return STORAGE_KEY_RE.test(storageKey);
}

export function generateStorageKey(extension: string): string {
  const uploadId = randomBytes(16).toString("hex");
  const ext = extension.startsWith(".") ? extension.slice(0, 33) : `.${extension}`.slice(0, 33);
  return `${uploadId}${ext}`;
}

export function resolveUploadFilePath(env: ApiEnv, storageKey: string): string {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("invalid_storage_key");
  }
  return path.join(resolveUploadDir(env), storageKey);
}

export async function readUploadFile(env: ApiEnv, storageKey: string): Promise<Uint8Array | null> {
  try {
    return await readFile(resolveUploadFilePath(env, storageKey));
  } catch {
    return null;
  }
}

export function guessContentType(storageKey: string): string {
  const ext = path.extname(storageKey).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    case ".m4a":
      return "audio/mp4";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".csv":
      return "text/csv";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

export function isAllowedUploadMime(contentType: string): boolean {
  const mime = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("video/")) return true;
  if (mime.startsWith("text/")) return true;

  return ALLOWED_UPLOAD_MIME_TYPES.has(mime);
}

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "application/json",
]);
